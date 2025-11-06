// Decoders and auto-detection logic for Auto Decode
(function(){
  'use strict';

  // --- low-level helpers ---
  function isPrintable(str){
    if(!str) return false;
    // allow common whitespace and punctuation; require at least some letters
    const printable = str.split('').filter(ch => (ch >= ' ' && ch <= '~')).length / Math.max(1, str.length);
    return printable > 0.9;
  }

  function scoreText(t){
    if(!t) return 0;
    const s = String(t);
    const letters = (s.match(/[A-Za-z]/g) || []).length;
    const vowels = (s.match(/[aeiouAEIOU]/g) || []).length;
    const spaces = (s.match(/\s/g) || []).length;
    const printableRatio = s.split('').filter(c => c >= ' ' && c <= '~').length / s.length;
    // combine factors
    return (letters*2 + vowels*3 + spaces*1.5) * printableRatio;
  }

  // --- decoders ---
  const decoders = {
    base64(input){
      try{
        // sanitize and handle url-safe base64
        let s = input.trim();
        s = s.replace(/\s+/g,'');
        s = s.replace(/-/g, '+').replace(/_/g, '/');
        while(s.length % 4 !== 0) s += '=';
        // atob returns binary string; to handle utf-8 use percent encoding trick
        const binary = atob(s);
        // convert binary string to UTF-8
        const bytes = Uint8Array.from(binary.split('').map(ch => ch.charCodeAt(0)));
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
      }catch(e){ throw new Error('Invalid Base64'); }
    },

    hex(input){
      const s = input.replace(/[^0-9a-fA-F]/g,'');
      if(s.length < 2) throw new Error('Invalid hex');
      const bytes = [];
      for(let i=0;i<s.length;i+=2){
        const hex = s.substr(i,2);
        bytes.push(parseInt(hex,16));
      }
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    },

    binary(input){
      const s = input.replace(/[^01\s]/g,'').trim();
      if(!s) throw new Error('Invalid binary');
      const parts = s.split(/\s+/);
      // if single long run, try chopping by 8
      if(parts.length===1 && parts[0].length % 8 === 0){
        const arr = [];
        for(let i=0;i<parts[0].length;i+=8) arr.push(parts[0].substr(i,8));
        return arr.map(b => String.fromCharCode(parseInt(b,2))).join('');
      }
      return parts.map(b => String.fromCharCode(parseInt(b,2))).join('');
    },

    rot13(input){
      return input.replace(/[A-Za-z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0)-base+13)%26)+base);
      });
    },

    leet(input){
      const map = { '4':'a','@':'a','8':'b','3':'e','6':'g','1':'l','0':'o','5':'s','7':'t','2':'z','$':'s','+':'t' };
      return input.replace(/[@43610527$+]/g, c => map[c] || c);
    },

    atbash(input){
      return input.replace(/[A-Za-z]/g, c=>{
        const base = c <= 'Z' ? 65 : 97;
        const off = c.charCodeAt(0)-base;
        return String.fromCharCode(base + (25-off));
      });
    },

    base32(input){
      // RFC4648 base32 decoder (no padding required)
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let s = input.toUpperCase().replace(/[^A-Z2-7=]/g,'');
      // remove padding
      s = s.replace(/=+$/,'');
      let bits = '';
      for(const ch of s){
        const idx = alphabet.indexOf(ch);
        if(idx === -1) throw new Error('Invalid Base32');
        bits += idx.toString(2).padStart(5,'0');
      }
      // group into bytes
      const bytes = [];
      for(let i=0;i+8<=bits.length;i+=8){
        bytes.push(parseInt(bits.substr(i,8),2));
      }
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    },

    reverse(input){
      return input.split('').reverse().join('');
    },

    html(input){
      // decode HTML entities using a DOM element
      try{
        const t = document.createElement('textarea');
        t.innerHTML = input;
        return t.value;
      }catch(e){ throw new Error('Invalid HTML entities'); }
    },

    morse(input){
      const table = {
        '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z',
        '-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9',
        '.-.-.-':'.','--..--':',','..--..':'?','-.-.--':'!','-..-.':'/','-.--.':'(','-.--.-':')','---...':':','-.-.-.':';','-....-':'-','.-.-.':'+','-...-':'=','.-..-.':'"',"...-..-":'$',".-...":'&','/':'/'
      };
      // allow both / and | as word separators
      const words = input.trim().replace(/\|/g,' / ').split(/\s{2,}|\s\/\s|\s\/|\/\s/);
      const out = words.map(w => {
        const chars = w.trim().split(/\s+/).map(s => table[s] || '?');
        return chars.join('');
      }).join(' ');
      if(!out) throw new Error('Invalid morse');
      return out;
    },

    caesar(input,shift=13){
      const s = Number(shift)||0;
      return input.replace(/[A-Za-z]/g, c=>{
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0)-base - s + 26) % 26) + base);
      });
    },

    url(input){
      try{ return decodeURIComponent(input); }catch(e){ throw new Error('Invalid URL encoding'); }
    }
  };

  // helper: convert various textual encodings into raw bytes
  function toBytes(input){
    const s = input.trim();
    // hex?
    if(/^[0-9a-fA-F\s]+$/.test(s) && s.replace(/\s+/g,'').length%2===0){
      const hex = s.replace(/\s+/g,'');
      const out = new Uint8Array(hex.length/2);
      for(let i=0;i<hex.length;i+=2) out[i/2] = parseInt(hex.substr(i,2),16);
      return out;
    }
    // base64?
    try{
      const cleaned = s.replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
      if(cleaned.length % 4 === 0){
        const bin = atob(cleaned);
        return Uint8Array.from(bin.split('').map(ch=>ch.charCodeAt(0)));
      }
    }catch(e){}
    // fallback: UTF-8 bytes
    return new TextEncoder().encode(s);
  }

  // try single-byte XOR key to produce candidates
  function trySingleByteXor(input){
    const bytes = toBytes(input);
    const candidates = [];
    for(let key=1; key<256; key++){
      const out = new Uint8Array(bytes.length);
      for(let i=0;i<bytes.length;i++) out[i] = bytes[i] ^ key;
      const text = new TextDecoder('utf-8', {fatal:false}).decode(out);
      const sc = scoreText(text);
      if(sc>0) candidates.push({algo:'xor', variant:key, text, score:sc});
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates.slice(0,8);
  }

  // Vigenère decryption (manual key)
  function vigenereDecrypt(input, key){
    if(!key) throw new Error('Missing Vigenère key');
    const cleanKey = key.replace(/[^A-Za-z]/g,'');
    if(!cleanKey) throw new Error('Invalid key');
    let ki = 0;
    return input.replace(/[A-Za-z]/g, c=>{
      const base = c <= 'Z' ? 65 : 97;
      const kbase = cleanKey[ki % cleanKey.length] <= 'Z' ? 65 : 97;
      const shift = (cleanKey.charCodeAt(ki % cleanKey.length) - kbase) % 26;
      ki++;
      return String.fromCharCode(((c.charCodeAt(0)-base - shift + 26) % 26) + base);
    });
  }

  // try each decoder and produce candidate outputs with scores
  function tryAll(input){
    const results = [];
    for(const key of Object.keys(decoders)){
      try{
        let out;
        if(key==='caesar'){
          // try all shifts and pick best for caesar
          let best = {score:0,shift:0,text:''};
          for(let shift=1;shift<26;shift++){
            const t = decoders.caesar(input, shift);
            const sc = scoreText(t);
            if(sc>best.score){ best = {score:sc,shift, text:t}; }
          }
          if(best.score>0) results.push({algo:'caesar', variant:best.shift, text:best.text, score:best.score});
        } else {
          out = decoders[key](input);
          const sc = scoreText(out);
          results.push({algo:key, text:out, score:sc});
        }
      }catch(e){ /* ignore invalid attempts */ }
    }
    // sort by score desc
    results.sort((a,b)=>b.score - a.score);

    // include single-byte XOR candidates (bruteforce) as additional possibilities
    try{
      const xorCands = trySingleByteXor(input);
      for(const c of xorCands) results.push(c);
    }catch(e){}

    // final sort and return
    results.sort((a,b)=>b.score - a.score);
    return results;
  }

  // UI wiring
  document.addEventListener('DOMContentLoaded', ()=>{
    const input = document.getElementById('inputText');
    const algo = document.getElementById('algoSelect');
    const decodeBtn = document.getElementById('decodeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const resultArea = document.getElementById('resultArea');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const candidateList = document.getElementById('candidateList');
    const caesarShift = document.getElementById('caesarShift');
    const vigenereKey = document.getElementById('vigenereKey');

    function renderCandidates(cands){
      candidateList.innerHTML = '';
      if(!cands || cands.length===0){ candidateList.textContent = 'No candidates found.'; return; }
      cands.forEach((c,i)=>{
        const el = document.createElement('div'); el.className='candidate';
        const meta = document.createElement('div'); meta.className='meta';
        meta.textContent = `${i+1}. ${c.algo}${c.variant?(' (shift='+c.variant+')'):''} — score ${Math.round(c.score)}`;
        const pre = document.createElement('pre'); pre.textContent = c.text;
        el.appendChild(meta); el.appendChild(pre);
        el.addEventListener('click', ()=>{ resultArea.textContent = c.text; });
        candidateList.appendChild(el);
      });
    }

    function doDecode(){
      const value = input.value.trim();
      if(!value){ resultArea.textContent = ''; candidateList.innerHTML = ''; return; }

      const selected = algo.value;
      try{
        if(selected==='auto'){
          const cands = tryAll(value);
          renderCandidates(cands);
          if(cands.length>0 && cands[0].score>10){
            resultArea.textContent = cands[0].text;
          } else {
            resultArea.textContent = 'No high-confidence auto-detection result — see candidates below.';
          }
        } else if(selected==='caesar'){
          const shift = Number(caesarShift.value)||13;
          const out = decoders.caesar(value, shift);
          resultArea.textContent = out;
          renderCandidates([{algo:'caesar',variant:shift,text:out,score:scoreText(out)}]);
        } else if(selected==='vigenere'){
          const key = (vigenereKey && vigenereKey.value) || '';
          const out = vigenereDecrypt(value, key);
          resultArea.textContent = out;
          renderCandidates([{algo:'vigenere',variant:key,text:out,score:scoreText(out)}]);
        } else if(selected==='xor'){
          const cands = trySingleByteXor(value);
          renderCandidates(cands);
          if(cands.length>0) resultArea.textContent = cands[0].text;
        } else {
          const out = decoders[selected](value);
          resultArea.textContent = out;
          renderCandidates([{algo:selected,text:out,score:scoreText(out)}]);
        }
      }catch(e){
        resultArea.textContent = 'Error: '+(e && e.message ? e.message : 'Unable to decode');
        candidateList.innerHTML = '';
      }
    }

    decodeBtn.addEventListener('click', doDecode);
    clearBtn.addEventListener('click', ()=>{ input.value=''; resultArea.textContent=''; candidateList.innerHTML=''; });
    copyBtn.addEventListener('click', ()=>{
      const t = resultArea.textContent || '';
      navigator.clipboard && navigator.clipboard.writeText(t);
    });
    downloadBtn.addEventListener('click', ()=>{
      const t = resultArea.textContent || '';
      const blob = new Blob([t], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'decoded.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    // allow cmd/ctrl+enter to decode
    input.addEventListener('keydown', e=>{ if((e.ctrlKey||e.metaKey) && e.key === 'Enter'){ doDecode(); } });
  });
})();

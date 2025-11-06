# Auto Decode — static decoders for GitHub Pages

This is a small static site that decodes strings in the browser. It supports Base64, Hex, Binary, ROT13, L33t, Morse, Caesar and URL decoding. The site is pure HTML/CSS/JS and designed to be hosted on GitHub Pages.

How to use

- Open `index.html` in a browser (double-click) to run locally.
- Or push this repository to GitHub and enable GitHub Pages (use the `main` branch / `gh-pages` branch or `docs/` folder option). The site will be served as static files.

Features

- Auto-detect mode: tries each decoder and ranks candidate outputs by a heuristic score (letters/vowels/printable ratio).
- Manual mode: pick an algorithm and decode explicitly (useful for Caesar shift or when auto-detect fails).
- Copy or download decoded results.

Security & privacy

All decoding happens in your browser. No remote calls are made; nothing is sent to any server by default.

Extending

To add a new decoder, edit `assets/script.js` and add a function to the `decoders` object, then add an option to the `<select>` in `index.html`.

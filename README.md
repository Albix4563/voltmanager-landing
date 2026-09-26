# VoltManager: sito ufficiale

Landing page di [VoltManager](https://github.com/Albix4563/VoltManager), l'app per Windows 10 e 11 che gestisce piani energetici, batteria, prestazioni e consumi.

Sito statico: HTML, CSS e JavaScript (moduli ES), senza build step né framework. L'hero 3D usa three.js incluso in locale; i font sono self-hosted. L'unica chiamata di rete è alla GitHub API, per leggere l'ultima release stabile (installer e portable) e le statistiche del repository.

## Avvio in locale

I moduli ES richiedono un server HTTP (non basta aprire il file):

```sh
python -m http.server 8080
```

Poi apri <http://localhost:8080>.

## Pubblicazione

Qualsiasi hosting statico va bene: carica il contenuto della cartella così com'è su GitHub Pages, Netlify, Cloudflare Pages o simili. Non serve alcuna configurazione.

## Struttura

```
index.html              markup e contenuti
assets/css/style.css    stile, temi chiaro e scuro
assets/js/main.js       tema, navigazione, download da GitHub, demo interattive
assets/js/scene.js      scena 3D dell'hero (three.js)
assets/vendor/          three.js r170
assets/fonts/           Archivo (variabile)
assets/img/             logo
```

## Download

I pulsanti "Scarica" puntano all'asset `VoltManagerSetup-*.exe` dell'ultima release stabile (`/releases/latest`, esclude le pre-release). Se la GitHub API non risponde, aprono la pagina dell'ultima release. La risposta è in cache per 10 minuti nella sessione del browser.

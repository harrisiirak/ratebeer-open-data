ratebeer-open-data
================

Handy CLI tool for scraping RB beers info and reviews data for statistical and educational purposes.
It's still in its early stages.

Setup
========
Download and initialize RB data.

```bash
sh ./update-ratebeer-data.sh
```

How to use
========

Download and extract first 1000 items data.

```bash
node index.js --data-range=1:1000
```

Scraped data location (by the default): `./data/scraped/`
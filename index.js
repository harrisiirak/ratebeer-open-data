'use strict';

let argv = require('yargs')
  .usage('Usage: $0 -input-path /path/to/beerlist')
  .example('$0 -input-path /path/to/beerlist', 'Scrape Ratebeer.com beers data')
  .default({'inputPath': './data/beers.txt'})
  .default({'outputPath': './data/scraped'})
  .default({'queueConcurrency': 3})
  .describe('input-path', 'Path where beers data is located')
  .describe('output-path', 'Path where beers extracted data is saved')
  .describe('data-range', 'Range of records that are processed')
  .describe('queue-concurrency', 'Processing queue concurrency (defaults to 3 parallel jobs)')
  .argv;

let fs = require('fs');
let async = require('async');
let readline = require('readline');
let ratebeer = require('ratebeer');
let Entities = require('html-entities').XmlEntities;

let entities = new Entities();
let count = 0;
let range = argv.dataRange ? argv.dataRange.split(':').map(function(part) {
  return parseInt(part);
}) : undefined;

function escapeBeerName(name) {
  return entities
    .decode(name)
    .replace(/\0/g, '')
    .trim();
}

function getBeerByUrl(url) {
  return new Promise((resolve, reject) => {
    ratebeer.getBeerByUrl(url, { includeUserRatings: true }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(result);
    });
  });
}

function getBeerByName(name) {
  return new Promise((resolve, reject) => {
    // Generate variations
    let response = null;
    let escapedName = name
      .replace(/’/g, '\'')
      .replace(/\(|\)|\//g, ' ')
      .replace(/(\swith\s)|(\sand\s)|(\sor\s)|(\svs\s)/g, '');
    let variation = null;
    let variations = [ escapedName ];

    // Generate variations
    // Remove brewery name
    variation = escapedName.split(' ');
    variation.shift();
    variation = variation.join(' ');
    variations.push(variation);

    // Remove last word as it may describe beer style
    variation = escapedName.split(' ');
    variation.pop();
    variation = variation.join(' ');
    variations.push(variation);

    async.eachSeries(variations, (variation, done) => {
      if (response) {
        done();
        return;
      }

      ratebeer.search(variation, function(err, data) {
        if (err) {
          console.error(err);
          done(err);
          return;
        }

        if (!data) {
          done();
          return;
        }

        response = {
          variation,
          data
        };

        done();
      });
    }, (err) => {
      if (err) {
        reject(new Error('Error while fetching data for ' + name));
        return;
      }

      if (!response || !response.data) {
        reject(new Error('No data for ' + name));
        return;
      }

      resolve(response.data);
    });
  });
}

function processBeerEntity(item, callback) {
  let url = '/beer/' + Math.random().toString(36).substring(2) + '/' + item.rbid + '/';
  let save = (result) => {
    fs.writeFile(argv.outputPath + '/' + item.rbid + '.json', JSON.stringify(result), callback);
  };

  getBeerByUrl(url)
    .then(save, (err) => {
      return getBeerByName(item.name)
        .then((result) => {
          return getBeerByUrl(result.url);
        }, (err) => {
          callback(err);
        })
        .then((result) => {
          if (!result) {
            return;
          }

          if (item.rbid !== result.id) {
            result.refId = result.id;
            result.id = item.rbid;
          }

          save(result);
        });
    })
    .catch((err) => {
      console.error(err);
      console.error(item);
    });
}

let searchCollection = [];
let reader = readline.createInterface({
  input: fs.createReadStream(argv.inputPath, { encoding: 'utf-16le' })
});

reader.on('line', function (line) {
  // Only process valid records
  let details = line.split('\t');
  if (details.length < 6) {
    return;
  }
  count++;

  // If range is enabled
  if ((range && range.length) && (count < range[0] || count > range[1])) {
    if (count > range[1]) {
      reader.close();
    }

    return;
  }
  
  let name = escapeBeerName(details[1]);
  searchCollection.push({
    rbid: +details[0],
    name,
    raw: details
  });
});

reader.on('close', function () {
  let count = searchCollection.length;
  let index = 0;
  let queue = async.queue(processBeerEntity, argv.queueConcurrency);

  queue.drain(() => {
    console.log('done');
  });

  searchCollection.forEach((item) => {
    queue.push(item, (err) => {
      let prefix = (++index) + '/' + count + ' (' + item.rbid + ') ';
      if (err) {
        console.log(prefix + 'ERROR processing for', item.name);
        console.log(err);
      } else {
        console.log(prefix + 'OK processing for', item.name);
      }
    });
  });

  console.log('start processing');
});

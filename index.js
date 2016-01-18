'use strict';

let argv = require('yargs')
  .usage('Usage: $0 -input-path /path/to/beerlist')
  .example('$0 -input-path /path/to/beerlist', 'Scrape Ratebeer.com beers data')
  .default({'inputPath': './data/beers.txt'})
  .default({'outputPath': './data/'})
  .describe('input-path', 'Path where beers data is located')
  .describe('output-path', 'Path where beers extracted data is saved')
  .describe('data-range', 'Range of records that are processed')
  .argv;

let fs = require('fs');
let async = require('async');
let readline = require('readline');
let ratebeer = require('ratebeer');
var iconv = require('iconv');
var utf8 = require('utf8');
var ic = new iconv.Iconv('iso-8859-1', 'utf-8');
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

function processSearchResult(query, result, done) {
  console.log(query);
  console.log(result);

  ratebeer.getBeerByUrl(result.url, { includeUserRatings: true }, (err, result) => {
    console.log(result);
    done();
  });
}

let searchCollection = [];
let reader = readline.createInterface({
  input: fs.createReadStream(argv.inputPath, { encoding: 'utf-16le' })
});

reader.on('line', function (line) {
  //line = utf8.decode(ic.convert(line).toString());

  // Only process valid records
  let details = line.split('\t');
  if (details.length < 6) {
    return;
  }
  count++;

  // If range is enabled
  if (range.length && (count < range[0] || count > range[1])) {
    if (count > range[1]) {
      reader.close();
    }

    return;
  }

  let name = escapeBeerName(details[1]);
  let variation = null;
  let variations = [ name ];

  // Generate variations
  // Remove brewery name
  variation = name.split(' ');
  variation.shift();
  variation = variation.join(' ');
  variations.push(variation);

  // Remove last word as it may describe beer style
  variation = name.split(' ');
  variation.pop();
  variation = variation.join(' ');
  variations.push(variation);

  searchCollection.push({
    name,
    variations,
    raw: details
  });
});

reader.on('close', function () {
  let queue = async.queue((item, callback) => {
    let response = null;

    async.eachSeries(item.variations, (variation, done) => {
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
        callback(new Error('Error while fetching data for ' + item.name));
        return;
      }

      if (!response || !response.data) {
        callback(new Error('No data for ' + item.name));
        return;
      }

      processSearchResult(response.variation, response.data, callback);
    })
  }, 1);

  queue.drain(() => {
    console.log('done');
  });

  searchCollection.forEach((item) => {
    queue.push(item, (err) => {
      console.log('done processing for', item.name);
    });
  });

  console.log('start processing');
});

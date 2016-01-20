#!/usr/bin/env bash

TMPFILE=`mktemp -t beers`
PWD=`pwd`
wget http://www.ratebeer.com/documents/downloads/beers.zip -O $TMPFILE
mkdir -p $PWD/data/scraped
unzip -d $PWD/data $TMPFILE
rm $TMPFILE
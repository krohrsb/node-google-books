/*
 * google-books
 * https://github.com/blackbarn/google-books
 *
 * Copyright (c) 2013 Kyle Brown
 * Licensed under the MIT license.
 */
'use strict';

// Dependencies
var request = require('request');
var qs = require('querystring');
var extend = require('extend');
var async = require('async');
var memoize = require('memoizee');
var _ = require('underscore');
var check = require('validator').check;
var sanitize = require('validator').sanitize;
// Variables

var GoogleBooks = function (options) {
    var defaults = {
        queryParams: {
            maxResults: 40,
            startIndex: 0,
            langRestrict: 'en',
            printType: 'books'
        },
        cacheOptions: {
            maxAge: 0,
            async: true,
            length: 1,
            primitive: true
        },
        setsToFetch: 1,
        apiUrl: 'https://www.googleapis.com/books/v1/volumes',
        logger: function () {}
    };

    var settings = extend(true, defaults, options || {});

    /**
     * Search Cache for searching google books. Uses the full API URI used for search as the key.
     * @type {null}
     */
    var searchCache = null;

    /**
     * Search for books via Google Books API
     * @private
     * @param {Object} options Contains the 'query' properties
     * @param {Function} next callback
     * <a href="https://developers.google.com/books/docs/v1/using#PerformingSearch">Google Books API Search</a>
     */
    function searchSingle(options, next) {
        var requestOptions, id, fullUri;
        options = options || {};

        try {
            check(options.query, 'Invalid search term').notNull().notEmpty();

            settings.logger.log('Searching for books with query', {query: options.query});

            if (!_.isNumber(options.startIndex) || options.startIndex < 0) {
                options.startIndex = 0;
            }

            requestOptions = {
                uri: settings.apiUrl,
                qs: extend(settings.queryParams, {
                    q: options.query,
                    startIndex: options.startIndex
                }),
                json: true
            };
            if (options.query.indexOf('id:') === 0) {
                id = options.query.replace('id:', '').replace('"', '');
                check(id, 'Invalid ID to search by').notNull().notEmpty();
                settings.logger.log('info', 'Search by ID Detected, using alternate resource', {id: id});
                requestOptions.uri = settings.apiUrl + '/' + id;
            }
            fullUri = requestOptions.uri + '?' + qs.stringify(requestOptions.qs);
            searchCache = searchCache || memoize(function (uri, requestOptions, next) {
                settings.logger.log('info', 'Not cached, Requesting Google Books API', {url: uri});
                request.get(requestOptions, function (err, response, body) {
                    if (err) {
                        next(err);
                    } else {
                        next(null, body);
                    }
                });
            }, settings.cacheOptions);
            settings.logger.log('info', 'Requesting data from Google Books Cache');
            searchCache(fullUri, requestOptions, function (err, body) {
                next(err, body);
            });
        } catch (err) {
            next(err);
        }
    }

    /**
     * Search for books via Google Books API grabbing multiple pages
     * @public
     * @param {Object} options Contains the 'query' property and optional 'sets' property
     * @param {Function} next callback
     * <a href="https://developers.google.com/books/docs/v1/using#PerformingSearch">Google Books API Search</a>
     */
    function search(options, next) {
        var i, jobs = [], sets, increment, createJob;
        sets = options.sets || settings.setsToFetch;
        increment = 40;
        sets = sanitize(sets).toInt();
        createJob = function (startIndex, options) {
            var opts = extend({}, options);
            opts.startIndex = startIndex;
            return function (next) {
                searchSingle(opts, next);
            };
        };
        for (i = 0; i < sets; i = i + 1) {
            jobs.push(createJob(increment * i, options));
        }
        async.series(jobs, function (err, results) {
            var allResults;
            allResults = [];
            if (err) {
                next(err);
            } else {
                results.forEach(function (result) {
                    allResults.push(result);
                });
                next(null, allResults);
            }
        });

    }

    /**
     * Search by a specific field.
     * <a href="https://developers.google.com/books/docs/v1/using#PerformingSearch">Google Books API Search</a>
     * @param {Object} options Contains the 'query', 'field' properties.
     * @param {Function} next callback
     */
    function searchBy(options, next) {
        var fields;
        options = options || {};
        //query, field
        fields = {
            title: 'intitle:',
            author: 'inauthor:',
            publisher: 'inpublisher:',
            subject: 'subject:',
            isbn: 'isbn:',
            lccn: 'lccn:',
            oclc: 'oclc:',
            id: 'id:'
        };
        try {
            check(options.query, 'Invalid search term').notNull().notEmpty();
            check(options.field, 'Must provide search field').notNull();
            if (!fields[options.field]) {
                throw new Error('Invalid field to search by');
            }
            settings.logger.log('info', 'Searching for books by type', {query: options.query, type: options.field});
            search({
                query: fields[options.field] + '"' + options.query + '"'
            }, next);
        } catch (err) {
            next(err);
        }
    }

    return {
        searchBy: searchBy,
        search: search
    };
};

module.exports = GoogleBooks;

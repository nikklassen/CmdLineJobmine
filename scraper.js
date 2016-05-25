(function() {
  'use strict';

  const request = require('request').defaults({
    jar: true,
    followAllRedirects: true,
    headers: {
      DNT: 1,
      Host: 'jobmine.ccol.uwaterloo.ca',
      Origin: 'https://jobmine.ccol.uwaterloo.ca',
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko)' +
        ' Chrome/41.0.2228.0 Safari/537.36',
      'Upgrade-Insecure-Requests': 1
    }
  });
  const cheerio = require('cheerio');
  const q = require('q');
  const moment = require('moment');

  const URLS = {
    LOGIN: 'https://jobmine.ccol.uwaterloo.ca/psp/SS?cmd=login',
    APPS: 'https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_APP_SUMMARY.GBL',
    OFFERS: 'https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_JOBSRCH.GBL',
    INTERVIEWS: 'https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_STU_INTVS',
    RANKINGS: 'https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_STU_RNK2.GBL'
  };

  const TABLE_SELECTOR = 'table.PSLEVEL1GRID';

  function paddingRight(s, paddingValue) {
    var padding = new Array(paddingValue + 1).join(' ');
    return (s + padding).slice(0, paddingValue);
  }

  function center(s, width) {
    var padding = width - s.length;
    var centered = '';
    for (let i = 0; i < Math.floor(padding / 2); i++) {
      centered += ' ';
    }
    centered += s;
    for (let i = 0; i < Math.ceil(padding / 2); i++) {
      centered += ' ';
    }
    return centered;
  }

  function colour(s, c) {
    var ec = '';
    switch (c) {
      case 'red':
        ec = '\x1b[31;1m';
        break;
      case 'green':
        ec = '\x1b[32;1m';
        break;
      case 'cyan':
        ec = '\x1b[36;1m';
        break;
      case 'yellow':
        ec = '\x1b[33;1m';
        break;
      case 'purple':
        ec = '\x1b[35;1m';
        break;
      default:
        break;
    }
    return ec + s + '\x1b[30;0m';
  }

  function printTable(headers, rows, colours, title) {
    const hasColours = typeof colours !== 'undefined';

    const maxWidths = [];
    headers.forEach(h => maxWidths.push(h.length));

    rows.forEach(r => {
      r.forEach((c, i) => {
        if (c.length > maxWidths[i]) {
          maxWidths[i] = c.length;
        }
      });
    });

    let rowWidth = headers.length - 1;
    let colWidths = maxWidths.map(max => {
      var newWidth = Math.ceil((max + 2) / 5) * 5;
      rowWidth += newWidth;
      return newWidth;
    });

    if (typeof title !== 'undefined') {
      console.log(colour(center(title, rowWidth), 'cyan') + '\n');
    }

    let rowString = '';
    headers.forEach((header, i) => {
      rowString += center(header, colWidths[i]);
      if (i !== headers.length - 1) {
        rowString += '|';
      }
    });
    console.log(rowString);

    const hrule = new Array(rowWidth + 1).join('-');
    console.log(hrule);

    rows.forEach((row, i) => {
      rowString = '';
      row.forEach((c, j) => {
        if (hasColours) {
          rowString += ' ' + colour(paddingRight(c, colWidths[j] - 1), colours[i]);
        } else {
          rowString += ' ' + paddingRight(c, colWidths[j] - 1);
        }

        if (j !== row.length - 1) {
          rowString += '|';
        }
      });
      console.log(rowString);
    });
  }

  function getCell(cells, i) {
    return cells.eq(i).text().trim();
  }

  function getPotentialOffers(casper, numActiveApps) {
    const p = q.defer();
    request(URLS.OFFERS, function(error, response, html) {
      if (error) {
        console.error(error);
        p.reject();
      }
      const $ = cheerio.load(html);
      const availableApps = parseInt($('#UW_CO_JOBSRCHDW_UW_CO_MAX_NUM_APPL').text(), 10);
      const potentialOffers = availableApps + numActiveApps - 50;
      console.log(colour('Potential offers: ' + potentialOffers, 'purple'));
      p.resolve();
    });
    return q.promise;
  }

  function getApps($) {
    let activeApps = 0;
    let hasRanked = false;

    const $tables = $(TABLE_SELECTOR);

    // Get the "Active apps" table
    let appT = $tables.eq(0);
    const appActive = new Set();

    appT.find('tr').slice(1).each((i, row) => {
      const cells = $(row).find('td');
      const jobKey = `${getCell(cells, 0)}_${getCell(cells, 1)}`;
      appActive.add(jobKey);
    });

    // Get the "All Apps" table
    appT = $tables.eq(1);
    const apps = [];
    // Skip the header row
    appT.find('tr').slice(1).each((i, row) => {
      const cells = $(row).find('td');

      const app = {
        title: getCell(cells, 1),
        employer: getCell(cells, 2),
        jobStatus: getCell(cells, 5),
        appStatus: getCell(cells, 6)
      };

      app.active = appActive.has(`${app.title}_${app.employer}`);
      apps.push(app);
    });

    const totals = {
      selected: 0,
      rejected: 0,
      alternate: 0,
      available: 0
    };

    const rows = [];
    const colours = [];

    apps.forEach(function(a) {
      if (['Not Selected', 'Not Ranked', 'Ranked'].includes(a.appStatus) ||
          (a.appStatus === 'Applied' && a.jobStatus === 'Cancelled')) {
        colours.push('red');
        totals.rejected += 1;
      } else if (['Selected', 'Scheduled'].includes(a.appStatus) ||
                 (a.appStatus === 'Applied' &&
                  ['Screened', 'Applied'].includes(a.jobStatus)) ||
                 a.appStatus === 'Employed') {
        colours.push('green');
        totals.selected += 1;
      } else if (a.appStatus === 'Alternate') {
        colours.push('cyan');
        totals.alternate += 1;
      } else if (a.appStatus === '') {
        if (a.jobStatus === 'Ranking Completed') {
          if (a.active) {
            colours.push('yellow');
            totals.selected += 1;
          } else {
            colours.push('red');
            totals.rejected += 1;
          }
          hasRanked = true;
        } else if (a.active) {
          // Jobmine bug -- observed to happen when rankings were 'unsubmitted'
          colours.push('green');
          totals.selected += 1;
        } else {
          colours.push('red');
          totals.rejected += 1;
        }
      } else {
        colours.push('');
        totals.available += 1;
      }

      rows.push([a.title, a.employer, a.jobStatus, a.appStatus]);

      if (a.active) {
        activeApps += 1;
      }
    });

    const headers = ['Title', 'Employer', 'Job Status', 'App Status'];

    printTable(headers, rows, colours);

    console.log('');
    console.log('Available: ' + paddingRight(totals.available, 20));
    console.log(colour('Selected: ' + paddingRight(totals.selected, 20), 'green'));
    if (totals.alternate !== 0) {
      console.log(colour('Alternate: ' + totals.alternate, 'cyan'));
    }
    console.log(colour('Not selected: ' + totals.rejected, 'red'));

    if (hasRanked) {
      getPotentialOffers(activeApps).done();
    }
  }

  function tableIsEmpty(table, testColumn) {
    if (typeof testColumn === 'undefined') testColumn = 1;
    const rows = table.find('tr');
    return rows.length < 2 || /^\s*$/.test(getCell(rows.eq(1).find('td'), testColumn));
  }

  function getInterviews($) {
    const $tables = $(TABLE_SELECTOR);
    const interviewT = $tables.eq(0);
    const groupT = $tables.eq(1);
    const specialT = $tables.eq(2);
    const cancelledT = $tables.eq(3);

    const individual = [];
    if (!tableIsEmpty(interviewT)) {
      interviewT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        individual.push({
          employer: getCell(cells, 2),
          job: getCell(cells, 3),
          date: getCell(cells, 4),
          type: getCell(cells, 5),
          time: getCell(cells, 7),
          duration: getCell(cells, 8),
          room: getCell(cells, 9)
        });
      });
    }

    const group = [];
    if (!tableIsEmpty(groupT)) {
      groupT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        group.push({
          employer: getCell(cells, 2),
          job: getCell(cells, 3),
          date: getCell(cells, 4),
          start: getCell(cells, 5),
          end: getCell(cells, 6),
          room: getCell(cells, 7)
        });
      });
    }

    const special = [];
    if (!tableIsEmpty(specialT)) {
      specialT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        special.push({
          employer: getCell(cells, 2),
          job: getCell(cells, 3),
          instructions: getCell(cells, 4)
        });
      });
    }

    const cancelled = [];
    if (!tableIsEmpty(cancelledT)) {
      cancelledT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        cancelled.push({
          employer: getCell(cells, 2),
          job: getCell(cells, 3)
        });
      });
    }

    const TWO_DAYS_FROM_NOW = moment().add(2, 'days');

    let headers = ['Employer', 'Job Title', 'Date', 'Type', 'Start Time', 'Length', 'Room'];
    let rows = [];
    let colours = [];

    individual.forEach(r => {
      if (r.room === '') {
        r.room = 'N/A';
      }

      const startDate = moment(r.date + ' ' + r.time, 'DD MMM YYYY hh:mm a');
      rows.push([r.employer, r.job, r.date, r.type, r.time, r.duration, r.room]);

      if (startDate < new Date()) {
        colours.push('');
      } else if (startDate < TWO_DAYS_FROM_NOW) {
        colours.push('green');
      } else {
        colours.push('cyan');
      }
    });

    printTable(headers, rows, colours, 'Interviews');

    if (group.length > 0) {
      headers = ['Employer', 'Job Title', 'Date', 'Start Time', 'Duration', 'Room'];
      rows = [];
      colours = [];

      const ONE_MINUTE = 60000;
      group.forEach(function(r) {
        const startDate = moment(`${r.date} ${r.start}`, 'DD MMM YYYY hh:mm a');
        const endDate = moment(`${r.date} ${r.end}`, 'DD MMM YYYY hh:mm a');
        const duration = Math.round((endDate - startDate) / ONE_MINUTE);

        rows.push([r.employer, r.job, r.date, r.start, duration.toString(), r.room]);

        if (startDate < new Date()) {
          colours.push('');
        } else if (startDate < TWO_DAYS_FROM_NOW) {
          colours.push('green');
        } else {
          colours.push('cyan');
        }
      });

      console.log('');
      printTable(headers, rows, colours, 'Group Interviews');
    }

    if (special.length > 0) {
      headers = ['Employer', 'Job Title', 'Instructions'];
      rows = [];
      colours = [];
      special.forEach(r => {
        rows.push([r.employer, r.job, r.instructions]);
        colours.push('');
      });

      console.log('');
      printTable(headers, rows, [], 'Special Request Interviews');
    }

    if (cancelled.length > 0) {
      headers = ['Employer', 'Job Title'];
      rows = [];
      colours = [];
      cancelled.forEach(r => {
        rows.push([r.employer, r.job]);
        colours.push('red');
      });

      console.log('');
      printTable(headers, rows, colours, 'Cancelled Interviews');
    }

    if (individual.length === 0 && group.length === 0 && special.length === 0) {
      console.log('You have no interviews :(');
    }
  }

  function getOpenRankings($) {
    var rankingT = $(TABLE_SELECTOR);

    var getUserRank = new RegExp(/value="(.?)" selected="selected"/);

    var rankings = [];
    if (!tableIsEmpty(rankingT)) {
      rankingT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        const ranking = {
          status: getCell(cells, 1),
          employerRank: getCell(cells, 2),
          title: getCell(cells, 4),
          employer: getCell(cells, 5),
          location: getCell(cells, 6),
          open: getCell(cells, 8),
          close: getCell(cells, 10) + ' ' + getCell(cells, 11)
        };

        var userRank = getUserRank.exec(cells.eq(0).html());
        if (userRank === null) {
          ranking.userRank = 0;
        } else if (userRank[1] === '') {
          ranking.userRank = 9;
        } else {
          ranking.userRank = parseInt(userRank[1], 10);
        }
        rankings.push(ranking);
      });
    }

    var headers = ['My rank', 'Status', 'Employer Rank', 'Job Title', 'Employer', 'Location', 'Open', 'Close'];
    var rows = [];
    var colours = [];

    function compareUserRank(a, b) {
      if (a.userRank !== b.userRank) {
        return a.userRank - b.userRank;
      }
      if (a.employer < b.employer) {
        return -1;
      } else if (a.employer > b.employer) {
        return 1;
      }
      return 0;
    }

    var sorted = rankings.filter(r => r.employerRank === 'Offer')
    .sort(compareUserRank)

    .concat(
      rankings.filter(r => r.employerRank !== 'Offer' && r.employerRank !== 'Not Ranked')
      .sort(compareUserRank)
    )

    .concat(
      rankings.filter(r => r.employerRank === 'Not Ranked')
      .sort()
    );

    sorted.forEach(function(r) {
      if (r.employerRank === 'Offer') {
        colours.push('green');
      } else if (r.employerRank === 'Not Ranked') {
        colours.push('red');
      } else {
        colours.push('');
      }

      rows.push([
        r.userRank === 0 ? 'N/A' : r.userRank.toString(),
        r.status,
        r.employerRank,
        r.title,
        r.employer,
        r.location,
        r.open,
        r.close
      ]);
    });

    printTable(headers, rows, colours, 'Rankings');
  }

  function getClosedRankings($) {
    const rankingT = $(TABLE_SELECTOR);
    const rankings = [];

    if (!tableIsEmpty(rankingT, 2)) {
      rankingT.find('tr').slice(1).each((i, row) => {
        const cells = $(row).find('td');

        const ranking = {
          title: getCell(cells, 3),
          employer: getCell(cells, 4),
          location: getCell(cells, 5),
          open: getCell(cells, 7) + ' ' + getCell(cells, 8),
          close: getCell(cells, 9) + ' ' + getCell(cells, 10)
        };
        rankings.push(ranking);
      });
    }

    const headers = ['Job Title', 'Employer', 'Location', 'Open', 'Close'];
    const rows = [];
    const colours = [];
    rankings.forEach(function(r) {
      if (/^\s*$/.test(r.open)) {
        colours.push('red');
      } else {
        colours.push('green');
      }

      rows.push([
        r.title,
        r.employer,
        r.location,
        r.open,
        r.close
      ]);
    });

    printTable(headers, rows, colours, 'Rankings');
  }

  function getRankings($) {
    const rankingT = $(TABLE_SELECTOR);
    const rankingsClosed = /^\s*$/.test(rankingT.find('tr').eq(1).text());

    if (rankingsClosed) {
      getClosedRankings($);
    } else {
      getOpenRankings($);
    }
  }

  let view = '';
  let url = '';
  switch (process.argv[2]) {
    case 'apps':
      view = getApps;
      url = URLS.APPS;
      break;
    case 'interviews':
      view = getInterviews;
      url = URLS.INTERVIEWS;
      break;
    case 'rankings':
      view = getRankings;
      url = URLS.RANKINGS;
      break;
    default:
      console.error(`Usage: ${process.argv[1]} (apps | interviews | rankings)`);
      process.exit(1);
  }

  request(URLS.LOGIN, function(error) {
    if (error) {
      console.error(error);
      return;
    }

    request.post({
      url: URLS.LOGIN,
      headers: {
        Referer: 'https://jobmine.ccol.uwaterloo.ca/psp/SS//SS?cmd=login&languageCd=ENG&'
      },
      form: {
        httpPort: '',
        timezoneOffset: 240,
        userid: process.env.JM_USER,
        pwd: process.env.JM_PWD,
        submit: 'Submit'
      }
    }, function(error, f, h) {
      if (error) {
        console.error(error);
        return;
      }

      request(url, function(error, response, html) {
        if (error) {
          console.error(error);
          return;
        }

        view(cheerio.load(html));
      });
    });
  });
}());

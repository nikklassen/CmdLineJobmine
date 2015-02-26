/* globals console, require */

Array.prototype.has = function(v) {
    return this.indexOf(v) !== -1;
}

function paddingRight(s, paddingValue) {
    var padding = '';
    for (var i = 0; i < paddingValue; i++) {
        padding += ' '
    }
    return (s + padding).slice(0, paddingValue)
}

function center(s, width) {
    var padding = width - s.length;
    var centered = ''
    for (var i = 0; i < Math.floor(padding/2); i++) {
        centered += ' '
    }
    centered += s
    for (i = 0; i < Math.ceil(padding/2); i++) {
        centered += ' '
    }
    return centered
}

function colour(s, c) {
    var ec = ''
    switch (c) {
        case 'red':
            ec = '\033[31;1m'
        break
        case 'green':
            ec = '\033[32;1m'
        break
        case 'cyan':
            ec = '\033[36;1m'
        break
        case 'yellow':
            ec = '\033[33;1m'
        break
    }
    return ec + s + '\033[30;0m'
}

var casper = require('casper').create()

casper.start('https://jobmine.ccol.uwaterloo.ca/psp/SS?cmd=login')

casper.then(function () {
    this.fill('#login', {
        userid: casper.cli.args[1],
        pwd: casper.cli.args[2]
    }, true)
})

function printTable(headers, rows, colours, title) {
    var hasColours = typeof colours !== 'undefined'

    var maxWidths = []
    headers.forEach(function(h) {
        maxWidths.push(h.length)
    })

    rows.forEach(function (r) {
        for (var i = 0; i < r.length; i++) {
            if (r[i].length > maxWidths[i]) {
                maxWidths[i] = r[i].length;
            }
        }
    })

    var rowWidth = headers.length - 1;
    var colWidths = maxWidths.map(function(max) {
        var newWidth = Math.ceil((max + 2) / 5) * 5
        rowWidth += newWidth
        return newWidth
    })

    if (typeof title !== 'undefined') {
        console.log(colour(center(title, rowWidth), 'cyan') + '\n')
    }

    var rowString = ''
    for (var i = 0; i < headers.length; i++) {
        rowString += center(headers[i], colWidths[i])
        if (i !== headers.length - 1) {
            rowString += '|'
        }
    }
    console.log(rowString)

    var hrule = ''
    for (i = 0; i < rowWidth; i++) {
        hrule += '-'
    }

    console.log(hrule)

    for (i = 0; i < rows.length; i++) {
        rowString = ''
        for (var j = 0; j < rows[i].length; j++) {
            if (hasColours) {
                rowString += ' ' + colour(paddingRight(rows[i][j], colWidths[j] - 1), colours[i])
            } else {
                rowString += ' ' + paddingRight(rows[i][j], colWidths[j] - 1)
            }

            if (j !== rows[i].length - 1) {
                rowString += '|'
            }
        }
        console.log(rowString)
    }
}

function getApps() {
    casper.thenOpen('https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_APP_SUMMARY.GBL', function () {
        var apps = this.evaluate(function() {
            // Get the "Active apps" table
            var appT = document.querySelectorAll('table.PSLEVEL1GRID > tbody')[0]
            var appActive = {}
            var cells = []

            for (var i = 1; i < appT.rows.length; i++) {
                cells = appT.rows[i].cells

                // title_employer
                var jobKey = cells[1].textContent.trim() + '_' + cells[2].textContent.trim()
                appActive[jobKey] = true
            }


            // Get the "All Apps" table
            appT = document.querySelectorAll('table.PSLEVEL1GRID > tbody')[1]
            var apps = []
            // Skip the header row
            for (i = 1; i < appT.rows.length; i++) {
                cells = appT.rows[i].cells

                var app = {
                    title: cells[1].textContent.trim(),
                    employer: cells[2].textContent.trim(),
                    jobStatus: (cells[5].textContent.trim() || ''),
                    appStatus: (cells[6].textContent.trim() || '')
                }

                app.active = (appActive[app.title + '_' + app.employer] || false)
                apps.push(app)
            }

            return apps
        })

        var totals = {
            selected: 0,
            rejected: 0,
            alternate: 0,
            available: 0
        }

        var rows = []
        var colours = []

        apps.forEach(function(a) {
            if (['Not Selected', 'Not Ranked', 'Ranked'].has(a.appStatus) ||
               (a.appStatus === 'Applied' && a.jobStatus === 'Cancelled')) {
                colours.push('red')
                totals.rejected += 1
            } else if (['Selected', 'Scheduled'].has(a.appStatus) ||
                      (a.appStatus === 'Applied' && ['Screened', 'Applied'].has(a.jobStatus)) ||
                      a.appStatus === 'Employed') {
                colours.push('green')
                totals.selected += 1
            } else if (a.appStatus === 'Alternate') {
                colours.push('cyan')
                totals.alternate += 1
            } else if (a.appStatus === '') {
                if (a.jobStatus === 'Ranking Completed') {
                    if (a.active === true) {
                        colours.push('yellow')
                        totals.selected += 1
                    } else {
                        colours.push('red')
                        totals.rejected += 1
                    }
                }
                // Jobmine bug -- observed to happen when rankings were 'unsubmitted'
                else {
                    if (a.active === true) {
                        colours.push('green')
                        totals.selected += 1
                    } else {
                        colours.push('red')
                        totals.rejected += 1
                    }
                }
            } else {
                colours.push('')
                totals.available += 1
            }

            rows.push([a.title, a.employer, a.jobStatus, a.appStatus])
        })

        var headers = ['Title', 'Employer', 'Job Status', 'App Status']

        printTable(headers, rows, colours)

        console.log('')
        console.log(colour('Selected: ' + paddingRight(totals.selected, 20), 'green'))
        if (totals.alternate !== 0) {
            console.log(colour('Alternate: ' + totals.alternate, 'cyan'))
        }
        console.log('Available: ' + paddingRight(totals.available, 20))
        console.log(colour('Not selected: ' + totals.rejected, 'red'))
    })
}

function getInterviews() {
    casper.thenOpen('https://jobmine.ccol.uwaterloo.ca/psc/SS/EMPLOYEE/WORK/c/UW_CO_STUDENTS.UW_CO_STU_INTVS')
    .then(function () {
        var interviews = this.evaluate(function() {
            var tables = document.querySelectorAll('table.PSLEVEL1GRID')
            var interviewT = tables[0],
            groupT = tables[1],
            specialT = tables[2],
            cancelledT = tables[3]

            var i
            var cells = []

            var individual = []
            var ws = new RegExp(/^\s*$/)
            if (interviewT.rows.length >= 2 && !ws.test(interviewT.rows[1].cells[1].textContent)) {
                for (i = 1; i < interviewT.rows.length; i++) {
                    cells = interviewT.rows[i].cells

                    individual.push({
                        employer: cells[2].textContent.trim(),
                        job: cells[3].textContent.trim(),
                        date: cells[4].textContent.trim(),
                        type: cells[5].textContent.trim(),
                        time: cells[7].textContent.trim(),
                        duration: cells[8].textContent.trim(),
                        room: cells[9].textContent.trim()
                    })
                }
            }

            var group = []
            if (groupT.rows.length >= 2 && !ws.test(groupT.rows[1].cells[1].textContent)) {
                for (i = 1; i < groupT.rows.length; i++) {
                    cells = groupT.rows[i].cells

                    group.push({
                        employer: cells[2].textContent.trim(),
                        job: cells[3].textContent.trim(),
                        date: cells[4].textContent.trim(),
                        start: cells[5].textContent.trim(),
                        end: cells[6].textContent.trim(),
                        room: cells[7].textContent.trim()
                    })
                }
            }

            var special = []
            if (specialT.rows.length >= 2 && !ws.test(specialT.rows[1].cells[1].textContent)) {
                for (i = 1; i < specialT.rows.length; i++) {
                    cells = specialT.rows[i].cells

                    special.push({
                        employer: cells[2].textContent.trim(),
                        job: cells[3].textContent.trim(),
                        instructions: cells[4].textContent.trim()
                    })
                }
            }

            var cancelled = []
            if (cancelledT.rows.length >= 2 && !ws.test(cancelledT.rows[1].cells[1].textContent)) {
                for (i = 1; i < cancelledT.rows.length; i++) {
                    cells = cancelledT.rows[i].cells

                    cancelled.push({
                        employer: cells[2].textContent.trim(),
                        job: cells[3].textContent.trim()
                    })
                }
            }

            return {
                individual: individual,
                group: group,
                special: special,
                cancelled: cancelled
            }
        })

        var oneMinute = 60000;
        var twoDaysFromNow = new Date(new Date().getTime() + 2 * 24 * 60 * oneMinute);

        var headers = ['Employer', 'Job Title', 'Date', 'Type', 'Start Time', 'Length', 'Room']
        var rows = []
        var colours = []

        interviews.individual.forEach(function (r) {
            if (r.room === '') {
                r.room = 'N/A'
            }

            var startDate = new Date(r.date + ' ' + r.time)
            rows.push([r.employer, r.job, r.date, r.type, r.time, r.duration, r.room]);

            if (startDate < new Date()) {
                colours.push('')
            } else if (startDate < twoDaysFromNow) {
                colours.push('green')
            } else {
                colours.push('cyan')
            }
        })

        printTable(headers, rows, colours, 'Interviews')

        if (interviews.group.length > 0) {
            headers = ['Employer', 'Job Title', 'Date', 'Start Time', 'Duration', 'Room']
            rows = []
            colours = []

            interviews.group.forEach(function (r) {
                var startDate = new Date(r.date + ' ' + r.start)
                var duration = Math.round((new Date(r.date + ' ' + r.end) - startDate) / oneMinute)

                rows.push([r.employer, r.job, r.date, r.start, duration.toString(), r.room])

                if (startDate < new Date()) {
                    colours.push('')
                } else if (startDate < twoDaysFromNow) {
                    colours.push('green')
                } else {
                    colours.push('cyan')
                }
            })

            console.log('')
            printTable(headers, rows, colours, 'Group Interviews')
        }

        if (interviews.special.length > 0) {
            headers = ['Employer', 'Job Title', 'Instructions']
            rows = []
            colours = []
            interviews.special.forEach(function (r) {
                rows.push([r.employer, r.job, r.instructions])
                colours.push('')
            })

            console.log('')
            printTable(headers, rows, [], 'Special Request Interviews')
        }

        if (interviews.cancelled.length > 0) {
            headers = ['Employer', 'Job Title']
            rows = []
            colours = []
            interviews.cancelled.forEach(function (r) {
                rows.push([r.employer, r.job])
                colours.push('red')
            })

            console.log('')
            printTable(headers, rows, colours, 'Cancelled Interviews')
        }

        if (interviews.individual.length === 0 && interviews.group.length === 0 && interviews.special.length === 0) {
            console.log('You have no interviews :(')
        }

    })
}

switch (casper.cli.args[0]) {
    case 'apps':
        getApps()
    break;
    case 'interviews':
        getInterviews()
    break;
    default:
        console.log('scraper.js --ignore-ssl-errors=true (apps|interviews) [ username ] [ password ]')
}

casper.run()

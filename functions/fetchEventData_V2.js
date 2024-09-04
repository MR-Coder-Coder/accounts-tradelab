const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// Helper function to remove commas from a string and convert to a float
const sanitizeNumber = (value) => {
    if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, ''));
    }
    return value;
};

// Helper function to ensure the number is valid
const validateNumber = (value) => {
    return isNaN(value) || value === undefined || value === null ? 0 : value;
};

// Helper function to format a date from a Unix timestamp to 'YYYY-MM-DD'
const formatDateFromUnix = (timestamp) => {
    const date = new Date(timestamp * 1000); // Convert from seconds to milliseconds
    return date.toISOString().split('T')[0]; // Format 'YYYY-MM-DD'
};

// Function to calculate exposure based on the side of the bet
const calculateExposure = (averageOdds, stake, side) => {
    if (side === 'Lay') {
        return (averageOdds * stake) - stake;
    } else if (side === 'Back') {
        return stake;
    }
    return 0;
};

exports.fetchEventData_V2 = functions
    .runWith({
        memory: '256MB',
        timeoutSeconds: 540,
        minInstances: 1,
        maxInstances: 30,
    })
    .https.onCall(async (data, context) => {
        try {
            let dailySummary = {}; // Object to hold the summary by date
            let nonTradingData = { nonTradingBookie: [], nonTradingBetfair: [] }; // Object to hold non-trading data
            let unmatchedEventData = { unmatchedBookie: {}, unmatchedBetfair: {} }; // Object to hold unmatched event data
            let totals = {
                dailySummaryCount: 0,
                eventDataCount: 0,
                unmatchedBookieCount: 0,
                unmatchedBetfairCount: 0,
                totalBetfairBalance: 0,
                totalBookieBalance: 0,
                totalNonTradingBookie: 0,
                totalNonTradingBetfair: 0,
                totalUnmatchedBookie: 0,
                totalUnmatchedBetfair: 0,
                grandTotalBookie: 0,
                grandTotalBetfair: 0
            }; // Object to hold totals

            const parseAmount = (amountStr) => {
                if (!amountStr) return 0.0;
                amountStr = amountStr.replace(',', '');
                if (amountStr.startsWith('(') && amountStr.endsWith(')')) {
                    return -parseFloat(amountStr.slice(1, -1));
                }
                return parseFloat(amountStr);
            };

            const calculateBetfairBalance = async (docIds) => {
                let totalCredit = 0;
                let totalDebit = 0;
                for (const docId of docIds) {
                    const doc = await db.collection('betfair-statement-test').doc(docId).get();
                    const data = doc.data();
                    if (data) {
                        if (data.creditAmount) {
                            totalCredit += parseAmount(data.creditAmount);
                        }
                        if (data.debitAmount) {
                            totalDebit -= parseAmount(data.debitAmount);
                        }
                    }
                }
                return validateNumber(totalCredit - totalDebit);
            };

            const calculateBookieBalance = async (docIds) => {
                let totalBalance = 0;
                for (const docId of docIds) {
                    const doc = await db.collection('bookie-statement-test').doc(docId).get();
                    const data = doc.data();
                    if (data && data.pnl) {
                        totalBalance += data.pnl;
                    }
                }
                return validateNumber(totalBalance);
            };

            const getDateAndSport = async (bookieDocIds) => {
                if (!bookieDocIds.length) {
                    return { date: new Date(0).toISOString(), sport: '0000' };
                }

                const doc = await db.collection('bookie-statement-test').doc(bookieDocIds[0]).get();
                const data = doc.data();
                if (data && data.description) {
                    const description = data.description;
                    const date = description.marketTime ? formatDateFromUnix(description.marketTime / 1000) : new Date(0).toISOString();
                    const sport = description.eventTypeId || '0000';
                    return { date, sport };
                }
                return { date: new Date(0).toISOString(), sport: '0000' };
            };

            const calculateExposureAndWinLose = async (betfairDocIds) => {
                let totalBetfairExposure = 0;
                let expectedWinSum = 0;
                let totalBetSize = 0;
                let wonOrLose = ''; // Default to 'W'

                for (const docId of betfairDocIds) {
                    const betfairDoc = await db.collection('betfair-statement-test').doc(docId).get();
                    const betfairData = betfairDoc.data();
                    if (betfairData) {
                        const betDescription = betfairData.event && betfairData.event.betDescription || '';
                        const averagePrice = sanitizeNumber(betfairData.averagePrice);
                        const betSize = sanitizeNumber(betfairData.betSize);

                        // Calculate exposure for Betfair
                        totalBetfairExposure += calculateExposure(averagePrice, betSize, betDescription);

                        // Calculate expected win
                        expectedWinSum += averagePrice * betSize;
                        totalBetSize += betSize;

                        // Determine Win or Lose
                        if (betfairData.winLose === 'Won') {
                            wonOrLose = 'L'; // It was a lay, so if won, show as 'L'
                        } else if (betfairData.winLose === 'Lost') {
                            wonOrLose = 'W'; // If lost, show as 'W'
                        }
                    }
                }

                // Calculate expected win percentage
                let expectedWin = totalBetSize > 0 ? validateNumber(1 / (expectedWinSum / totalBetSize)) : 0;

                return {
                    totalBetfairExposure: validateNumber(totalBetfairExposure),
                    expectedWin: validateNumber(expectedWin),
                    wonOrLose
                };
            };

            const newMatchedEventsSnapshot = await db.collection('NewmatchedEvents-test').get();
            const matchedBetfairDocIds = new Set();
            const matchedBookieDocIds = new Set();

            // Collect all betfairDocIds and bookieDocIds that are in NewmatchedEvents-test
            for (const doc of newMatchedEventsSnapshot.docs) {
                const eventData = doc.data();
                const betfairDocIds = eventData.betfairDocIds || [];
                const bookieDocIds = eventData.bookieDocIds || [];

                betfairDocIds.forEach(id => matchedBetfairDocIds.add(id));
                bookieDocIds.forEach(id => matchedBookieDocIds.add(id));
            }

            // Process matched events to populate dailySummary
            for (const doc of newMatchedEventsSnapshot.docs) {
                const eventId = doc.id;
                const eventData = doc.data();

                const betfairDocIds = eventData.betfairDocIds || [];
                const bookieDocIds = eventData.bookieDocIds || [];

                const betfairBalance = await calculateBetfairBalance(betfairDocIds);
                const bookieBalance = await calculateBookieBalance(bookieDocIds);
                const tradeGP = validateNumber(betfairBalance + bookieBalance);
                const betfairCount = betfairDocIds.length;
                const bookieCount = bookieDocIds.length;
                const totalCount = betfairCount + bookieCount;

                const { date, sport } = await getDateAndSport(bookieDocIds);

                // Calculate Betfair exposure and win/lose
                const { totalBetfairExposure, expectedWin, wonOrLose } = await calculateExposureAndWinLose(betfairDocIds);

                const dataObject = {
                    'Event ID': eventId,
                    'Betfair Balance': betfairBalance,
                    'Bookie Balance': bookieBalance,
                    'TradeGP': tradeGP,
                    'Betfair Count': betfairCount,
                    'Bookie Count': bookieCount,
                    'Total Count': totalCount,
                    'Date': date,
                    'Sport': sport,
                    'Betfair Exposure': totalBetfairExposure,
                    'Expected Win': expectedWin,
                    'Won or Lose': wonOrLose
                };

                // Extract the date from the doc.id and use it to group data
                const eventDate = eventId.split('_')[0]; // Assuming the date is at the start of the ID before '_'

                // Initialize or update the daily summary object for the extracted date
                if (!dailySummary[eventDate]) {
                    dailySummary[eventDate] = {
                        'Total Betfair Balance': 0,
                        'Total Bookie Balance': 0,
                        'Total TradeGP': 0,
                        'Total Count': 0,
                        'eventData': {}
                    };
                }

                // Update the summary values for the specific date
                dailySummary[eventDate]['Total Betfair Balance'] += betfairBalance;
                dailySummary[eventDate]['Total Bookie Balance'] += bookieBalance;
                dailySummary[eventDate]['Total TradeGP'] += tradeGP;
                dailySummary[eventDate]['Total Count'] += totalCount;

                // Add the event data to the corresponding date in eventData
                dailySummary[eventDate]['eventData'][eventId] = dataObject;

                // Update totals
                totals.totalBetfairBalance += betfairBalance;
                totals.totalBookieBalance += bookieBalance;
                totals.eventDataCount += 1;
                totals.grandTotalBookie += bookieBalance;
                totals.grandTotalBetfair += betfairBalance;

            }

            // Fetch non-trading Betfair records
            const betfairSnapshot = await db.collection('betfair-statement-test').get();
            betfairSnapshot.forEach((doc) => {
                const data = doc.data();
                if (!matchedBetfairDocIds.has(doc.id)) {
                    if (data.event && data.event.nameAndSelectionName === 'Cross accounts transfer') {
                        // Non-trading data
                        nonTradingData.nonTradingBetfair.push(data);
                        // Calculate total for non-trading Betfair
                        totals.totalNonTradingBetfair += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                        totals.grandTotalBetfair += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                    } else {
                        // Unmatched event data
                        const eventDate = data.formattedSettledDate
                        if (!unmatchedEventData.unmatchedBetfair[eventDate]) {
                            unmatchedEventData.unmatchedBetfair[eventDate] = {
                                'Total Betfair Balance': 0,
                                'Total Bookie Balance': 0,
                                'Total TradeGP': 0,
                                'Total Count': 0,
                                'eventData': {}
                            };
                        }

                        unmatchedEventData.unmatchedBetfair[eventDate]['Total Betfair Balance'] += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                        unmatchedEventData.unmatchedBetfair[eventDate]['Total TradeGP'] += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                        unmatchedEventData.unmatchedBetfair[eventDate]['Total Count'] += 1;
                        unmatchedEventData.unmatchedBetfair[eventDate]['eventData'][doc.id] = data;

                        // Update totals for unmatched Betfair
                        totals.totalUnmatchedBetfair += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                        totals.grandTotalBetfair += parseAmount(data.creditAmount) + parseAmount(data.debitAmount);
                        totals.unmatchedBetfairCount += 1;
                    }
                }
            });

            // Fetch non-trading Bookie records
            const bookieSnapshot = await db.collection('bookie-statement-test').get();
            bookieSnapshot.forEach((doc) => {
                const data = doc.data();
                
                // Check if the document ID is not in matchedBookieDocIds
                if (!matchedBookieDocIds.has(doc.id)) {
                    // Check for non-trading actions
                    if (data.action && ['CREDIT', 'OPEN', 'TRANSFER_DOWN'].includes(data.action)) {
                        // Non-trading data
                        nonTradingData.nonTradingBookie.push(data);
                        // Calculate total for non-trading Bookie
                        totals.totalNonTradingBookie += data.pnl;
                        totals.grandTotalBookie += data.pnl;
                    } 
                    // Else-if condition to check for unmatched records
                    else if (!data.Matched || (data.Matched !== 'YES' && data.Matched !== 'NEVER')) {
                        // Unmatched event data
                        const eventDate = data.description && data.description.marketTime ? formatDateFromUnix(data.description.marketTime / 1000) : 'Unknown'; // Convert marketTime to 'YYYY-MM-DD'
                        if (!unmatchedEventData.unmatchedBookie[eventDate]) {
                            unmatchedEventData.unmatchedBookie[eventDate] = {
                                'Total Betfair Balance': 0,
                                'Total Bookie Balance': 0,
                                'Total TradeGP': 0,
                                'Total Count': 0,
                                'eventData': {}
                            };
                        }
                        unmatchedEventData.unmatchedBookie[eventDate]['Total Bookie Balance'] += data.pnl;
                        unmatchedEventData.unmatchedBookie[eventDate]['Total TradeGP'] += data.pnl;
                        unmatchedEventData.unmatchedBookie[eventDate]['Total Count'] += 1;
                        unmatchedEventData.unmatchedBookie[eventDate]['eventData'][doc.id] = data;

                        // Update totals for unmatched Bookie
                        totals.totalUnmatchedBookie += data.pnl;
                        totals.grandTotalBookie += data.pnl;
                        totals.unmatchedBookieCount += 1;
                    }
                }
            });

            // Calculate dailySummaryCount
            totals.dailySummaryCount = Object.keys(dailySummary).length;

            return {
                dailySummary,
                nonTradingData,
                unmatchedEventData,
                totals
            };

        } catch (error) {
            console.error("Error fetching data:", error);
            throw new functions.https.HttpsError('unknown', 'Failed to fetch data');
        }
    });

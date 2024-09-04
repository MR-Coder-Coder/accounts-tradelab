const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stringSimilarity = require('string-similarity'); // Import the string-similarity package

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

// Helper function to normalize and sort strings
function normalizeAndSortString(inputString) {
    let normalized = inputString.toLowerCase();
    normalized = normalized.replace(/[^a-zA-Z0-9\s]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    const sortedWords = normalized.split(' ').sort();
    return sortedWords.join(' ');
}

// Helper function to calculate token-based similarity
function calculateTokenSimilarity(str1, str2) {
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0.0;
    return (intersection.size / union.size) * 100;
}

// Function to calculate sequence-based similarity using string-similarity
function calculateSequenceSimilarity(str1, str2) {
    return stringSimilarity.compareTwoStrings(str1, str2) * 100;
}

// Function to convert Unix timestamp to Date object
function convertUnixToDatetime(unixTimestamp) {
    return new Date(unixTimestamp);
}

// Function to check if two events are within a certain time window
function isWithinTimeWindow(betfairTimeStr, bookieDatetime, windowHours = 36) {
    const betfairDatetime = new Date(betfairTimeStr);
    const timeDifference = Math.abs(betfairDatetime - bookieDatetime);
    const withinWindow = timeDifference <= windowHours * 60 * 60 * 1000;
    console.log(`Comparing Betfair datetime ${betfairDatetime} with Bookie datetime ${bookieDatetime}: 
        Difference is ${timeDifference}, Within ${windowHours}-hour window: ${withinWindow}`);
    return withinWindow;
}

// Function to get unmatched documents from a Firestore collection
async function getUnmatchedDocuments(collectionName, matchField = 'Matched', exclusions = []) {
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();
    const unmatchedDocs = {};
    const excludedDocs = [];

    snapshot.forEach(doc => {
        const docData = doc.data();
        const docId = doc.id;

        if (docData[matchField] === 'YES') return;

        if (exclusions.some(exclusion => exclusion(docData))) {
            excludedDocs.push(docId);
            return;
        }

        unmatchedDocs[docId] = docData;
    });

    // Mark excluded documents with 'Matched': 'NEVER'
    excludedDocs.forEach(async docId => {
        await db.collection(collectionName).doc(docId).update({ Matched: 'NEVER' });
        console.log(`Marked ${collectionName}/${docId} as NEVER matched due to exclusion criteria.`);
    });

    return unmatchedDocs;
}

// Exclusion functions
function excludeBetfair(doc) {
    return doc.event?.nameAndSelectionName === 'Cross accounts transfer';
}

function excludeBookie(doc) {
    if (['CREDIT', 'OPEN', 'TRANSFER_DOWN'].includes(doc.action)) return true;
    if (doc.pnl === 0) return true;
    return false;
}

// Function to create matched events in Firestore
async function createMatchedEvent(eventName, matchedData) {
    const matchedRef = db.collection('NewmatchedEvents-test').doc(eventName);
    await matchedRef.set(matchedData, { merge: false });
    console.log(`Created matched event for ${eventName} with data: ${JSON.stringify(matchedData)}`);
}

// Grouping unmatched Betfair documents
function groupUnmatchedBetfairDocs(unmatchedBetfairDocs) {
    const betfairGroups = {};
    for (const [docId, doc] of Object.entries(unmatchedBetfairDocs)) {
        const eventKey = `${doc.formattedSettledDate}_${doc.formattedSettledTime}_${doc.bookieMatchEvent}`;
        if (!betfairGroups[eventKey]) {
            betfairGroups[eventKey] = { betfairDocIds: [], searchString: new Set() };
        }
        betfairGroups[eventKey].betfairDocIds.push(docId);

        const selection = normalizeAndSortString(doc.bookieMatchSelection || '');
        if (selection) betfairGroups[eventKey].searchString.add(selection);

        const eventName = normalizeAndSortString(doc.bookieMatchEvent || '');
        if (eventName) betfairGroups[eventKey].searchString.add(eventName);
    }

    // Convert sets to concatenated strings
    Object.values(betfairGroups).forEach(group => {
        group.searchString = Array.from(group.searchString).join(' ');
    });

    return betfairGroups;
}

// Grouping unmatched Bookie documents
function groupUnmatchedBookieDocs(unmatchedBookieDocs) {
    const bookieGroups = {};
    for (const [docId, doc] of Object.entries(unmatchedBookieDocs)) {
        const description = doc.description || {};
        const marketTime = description.marketTime;
        const eventName = description.eventName;

        if (marketTime && eventName) {
            const eventKey = `${marketTime}_${eventName}`;
            if (!bookieGroups[eventKey]) {
                bookieGroups[eventKey] = { bookieDocIds: [], searchString: new Set() };
            }
            bookieGroups[eventKey].bookieDocIds.push(docId);

            if (description.selectionName) {
                const selection = normalizeAndSortString(description.selectionName);
                if (selection) bookieGroups[eventKey].searchString.add(selection);
            }

            const normalizedEventName = normalizeAndSortString(eventName);
            if (normalizedEventName) bookieGroups[eventKey].searchString.add(normalizedEventName);
        }
    }

    // Convert sets to concatenated strings
    Object.values(bookieGroups).forEach(group => {
        group.searchString = Array.from(group.searchString).join(' ');
    });

    return bookieGroups;
}

// Function to check and add matched event only if valid
async function checkAndCreateMatchedEvent(eventName, matchedData, matchedBetfairIds, matchedBookieIds) {
    const newBetfairIds = matchedData.betfairDocIds || [];
    const newBookieIds = matchedData.bookieDocIds || [];

    // Check for duplicates in Betfair IDs
    for (const betfairId of newBetfairIds) {
        if (matchedBetfairIds.has(betfairId)) {
            console.log(`Duplicate Betfair ID ${betfairId} found in multiple events, skipping.`);
            return false;  // Do not proceed if there's a duplicate
        }
    }

    // Check for duplicates in Bookie IDs
    for (const bookieId of newBookieIds) {
        if (matchedBookieIds.has(bookieId)) {
            console.log(`Duplicate Bookie ID ${bookieId} found in multiple events, skipping.`);
            return false;  // Do not proceed if there's a duplicate
        }
    }

    // No duplicates found, proceed to create matched event
    await createMatchedEvent(eventName, matchedData);

    // Update the matched IDs sets
    newBetfairIds.forEach(id => matchedBetfairIds.add(id));
    newBookieIds.forEach(id => matchedBookieIds.add(id));

    // Mark documents as matched only after successfully creating the event
    newBetfairIds.forEach(async docId => {
        await db.collection('betfair-statement-test').doc(docId).update({ Matched: 'YES', matchedEventId: eventName });
    });
    newBookieIds.forEach(async docId => {
        await db.collection('bookie-statement-test').doc(docId).update({ Matched: 'YES', matchedEventId: eventName });
    });

    return true;
}

// Main matching function
async function matchEvents(confidenceThreshold, windowHours) {
    const unmatchedBetfairDocs = await getUnmatchedDocuments('betfair-statement-test', 'Matched', [excludeBetfair]);
    const unmatchedBookieDocs = await getUnmatchedDocuments('bookie-statement-test', 'Matched', [excludeBookie]);

    const betfairGroups = groupUnmatchedBetfairDocs(unmatchedBetfairDocs);
    const bookieGroups = groupUnmatchedBookieDocs(unmatchedBookieDocs);

    const matchedBookieIds = new Set();
    const matchedBetfairIds = new Set();

    // Match Betfair and Bookie groups
    for (const [betfairEventKey, betfairData] of Object.entries(betfairGroups)) {
        const [betfairDateStr, betfairTimeStr, betfairEventName] = betfairEventKey.split('_');
        const betfairDatetimeStr = `${betfairDateStr} ${betfairTimeStr}`;
        let matchFound = false;

        for (const [bookieEventKey, bookieData] of Object.entries(bookieGroups)) {
            const [bookieMarketTime, bookieEventName] = bookieEventKey.split('_');
            const bookieDatetime = convertUnixToDatetime(Number(bookieMarketTime));

            if (isWithinTimeWindow(betfairDatetimeStr, bookieDatetime, windowHours)) {
                const sequenceConfidence = calculateSequenceSimilarity(betfairData.searchString, bookieData.searchString);
                const tokenConfidence = calculateTokenSimilarity(betfairData.searchString, bookieData.searchString);
                const combinedConfidence = (sequenceConfidence + tokenConfidence) / 2;

                if (combinedConfidence >= confidenceThreshold) {
                    const eventName = `${betfairDateStr}_${bookieEventKey}`;
                    const matchedData = {
                        betfairDocIds: betfairData.betfairDocIds,
                        bookieDocIds: bookieData.bookieDocIds
                    };

                    // Use the new function to safely add matched events
                    const success = await checkAndCreateMatchedEvent(eventName, matchedData, matchedBetfairIds, matchedBookieIds);

                    if (success) {
                        matchFound = true;
                    }
                }
            }
        }

        if (!matchFound) {
            console.log(`No match found for Betfair event ${betfairEventKey}.`);
        }
    }
}

// Callable Cloud Function to manually trigger the matching process
exports.manualMatchEvents = functions.https.onCall(async (data, context) => {
    console.log('Manual trigger received for matching events');

    // Optionally, you can use data passed from the client to customize the behavior
    const confidenceLevels = data.confidenceLevels || [95, 75, 40];  // Confidence thresholds to use
    const timeWindows = data.timeWindows || [24, 36, 48];  // Time windows to use (in hours)

    try {
        for (const confidenceThreshold of confidenceLevels) {
            for (const windowHours of timeWindows) {
                console.log(`Running matching with confidence threshold: ${confidenceThreshold}% and time window: ${windowHours} hours`);
                await matchEvents(confidenceThreshold, windowHours);
            }
        }
        return { success: true, message: 'Matching process completed successfully.' };
    } catch (error) {
        console.error('Error during matching process:', error);
        return { success: false, message: 'An error occurred during the matching process.', error: error.message };
    }
});

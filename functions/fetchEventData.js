const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

exports.fetchEventData = functions.https.onCall(async (data, context) => {
    try {
        let bookieCount = 0;
        let betfairCount = 0;
        let bookieBalance = 0;
        let betfairBalance = 0;
        let betListCount = 0;
        let matchedEventsCount = 0;
        let betfairBetListCount = 0;
        let totalTradeGP = 0;
        let nonTradingTotalsBookie = 0;
        let nonTradingTotalsBetfair = 0;
        let eventsData = [];

        const parseAmount = (amountStr) => {
            if (!amountStr) return 0.0;
            amountStr = amountStr.replace(',', '');
            if (amountStr.startsWith('(') && amountStr.endsWith(')')) {
                return parseFloat(amountStr.slice(1, -1));
            }
            return parseFloat(amountStr);
        };

        const bookieSnapshot = await db.collection('bookie-statement').get();
        bookieSnapshot.forEach((doc) => {
            const data = doc.data();
            bookieCount += 1;
            if (data.pnl) {
                bookieBalance += data.pnl;
            }
        });

        const betfairSnapshot = await db.collection('betfair-statement').get();
        betfairSnapshot.forEach((doc) => {
            const data = doc.data();
            betfairCount += 1;
            if (data.creditAmount) {
                betfairBalance += parseAmount(data.creditAmount);
            }
            if (data.debitAmount) {
                betfairBalance -= parseAmount(data.debitAmount);
            }
        });

        const betListSnapshot = await db.collection('bet-list').get();
        betListCount = betListSnapshot.size;

        const matchedEventsSnapshot = await db.collection('matchedEvents').get();
        matchedEventsCount = matchedEventsSnapshot.size;

        const betfairBetListSnapshot = await db.collection('betfair-bet-list').get();
        betfairBetListCount = betfairBetListSnapshot.size;

        const eventSnapshot = await db.collection('matchedEvents').get();
        eventSnapshot.forEach((doc) => {
            const event = doc.data();
            eventsData.push(event);
            totalTradeGP += parseFloat(event.TradeGP);
        });

        const bookieQuery = db.collection('bookie-statement')
            .where('action', 'in', ['CREDIT', 'OPEN', 'TRANSFER_DOWN']);
        const bookieQuerySnapshot = await bookieQuery.get();
        bookieQuerySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.pnl) {
                nonTradingTotalsBookie += data.pnl;
            }
        });

        const betfairQuerySnapshot = await db.collection('betfair-statement').get();
        betfairQuerySnapshot.forEach((doc) => {
            const data = doc.data();
            const event = data.event;

            if (event && event.nameAndSelectionName === 'Cross accounts transfer') {
                if (data.creditAmount) {
                    nonTradingTotalsBetfair += parseAmount(data.creditAmount);
                }
            }
        });

        return {
            summaryData: {
                bookieCount,
                betfairCount,
                betListCount,
                matchedEventsCount,
                betfairBetListCount,
                bookieBalance,
                betfairBalance,
            },
            eventsData,
            totalTradeGP,
            nonTradingTotalsBookie,
            nonTradingTotalsBetfair,
        };
    } catch (error) {
        console.error("Error fetching data:", error);
        throw new functions.https.HttpsError('unknown', 'Failed to fetch data');
    }
});

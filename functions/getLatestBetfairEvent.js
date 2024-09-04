const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

exports.getLatestBetfairEvent = functions.https.onCall(async (data, context) => {
    try {
        const latestBetfairEventCollection = await db.collection('latest-betfair-event').get();
        const events = latestBetfairEventCollection.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return { events };
    } catch (error) {
        console.error('Error fetching latest Betfair event:', error);
        throw new functions.https.HttpsError('internal', 'Unable to fetch latest Betfair event');
    }
});

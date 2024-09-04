const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

exports.getEventDetails = functions.https.onCall(async (data, context) => {
    const { eventName } = data;
  
    try {
          // Fetch the matched event document using docId
          const matchedEventRef = db.collection('matchedEvents').doc(eventName);
          const matchedEventDoc = await matchedEventRef.get();
  
          if (!matchedEventDoc.exists) {
              throw new Error(`No event found with ID: ${eventName}`);
          }
        const matchedEventData = matchedEventDoc.data();
        const { betfairDocIds = [], bookieDocIds = [] } = matchedEventData;
  
        // Fetch betfair data
        const betfairPromises = betfairDocIds.map(id => db.collection('betfair-statement').doc(id).get());
        const betfairDocs = await Promise.all(betfairPromises);
        const betfairDataArray = betfairDocs.map(doc => doc.data());
  
        // Fetch bookie data
        const bookiePromises = bookieDocIds.map(id => db.collection('bookie-statement').doc(id).get());
        const bookieDocs = await Promise.all(bookiePromises);
        const bookieDataArray = bookieDocs.map(doc => doc.data());
  
        return {
            betfairData: betfairDataArray,
            bookieData: bookieDataArray
        };
    } catch (error) {
        console.error('Error fetching event details:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
  });
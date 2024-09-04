const functions = require('firebase-functions');
const admin = require('firebase-admin');

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

exports.getBettingData = functions.https.onCall(async (data, context) => {
  try {
    // Fetch latest Betfair statement data
    const betfairDocRef = db.collection('latest-betfair-bets').doc('current');
    const betfairDocSnap = await betfairDocRef.get();
    let betfairData = [];
    if (betfairDocSnap.exists) {
      const betfairDoc = betfairDocSnap.data();
      betfairData = betfairDoc.bets; // Fetch all items from bets array
    }

    // Fetch latest Bookie statement data
    const bookieDocRef = db.collection('latest-bookie-bets').doc('current');
    const bookieDocSnap = await bookieDocRef.get();
    let bookieData = [];
    if (bookieDocSnap.exists) {
      const bookieDoc = bookieDocSnap.data();
      bookieData = bookieDoc.result; // Fetch all items from results array
    }

    // Initialize exposure data map to aggregate by eventDescription and selectionName
    const exposureDataMap = new Map();

    // Process Betfair data
    betfairData.forEach(betfairBet => {
      const matchingBookieBets = bookieData.filter(bookieBet => bookieBet.selectionName === betfairBet.selectionName);

      let totalBetfairExposure = 0;
      let totalBookieExposure = 0;

      // Sanitize the values before calculation
      const sanitizedAverageOddsMatched = sanitizeNumber(betfairBet.averageOddsMatched);
      const sanitizedStake = sanitizeNumber(betfairBet.stake);

      if (betfairBet.side === 'LAY') {
        // Calculate Betfair exposure for LAY
        totalBetfairExposure = (sanitizedAverageOddsMatched * sanitizedStake) - sanitizedStake;

        // Find all bets with the same eventDescription but different selectionName
        const otherBetsSameEvent = betfairData.filter(bet => bet.eventDescription === betfairBet.eventDescription && bet.selectionName !== betfairBet.selectionName);

        // Subtract the stakes of the other bets with the same eventDescription
        otherBetsSameEvent.forEach(otherBet => {
          const otherStake = sanitizeNumber(otherBet.stake);
          totalBetfairExposure -= otherStake;
        });

      } else if (betfairBet.side === 'BACK') {
        // For BACK, just add the stake as exposure
        totalBetfairExposure = sanitizedStake;
      }

      // Calculate Bookie exposure
      matchingBookieBets.forEach(matchingBookieBet => {
        const sanitizedBookieAverageOddsMatched = sanitizeNumber(matchingBookieBet.averagePrice);
        const sanitizedBookieSizeMatched = sanitizeNumber(matchingBookieBet.sizeMatched);

        let bookieExposure = 0;

        if (matchingBookieBet.side === 1) { // Bookie LAY
          // Calculate Bookie exposure for LAY
          bookieExposure = (sanitizedBookieAverageOddsMatched * sanitizedBookieSizeMatched) - sanitizedBookieSizeMatched;

          // Find all bets with the same eventName but different selectionName
          const otherBetsSameEvent = bookieData.filter(bet => bet.eventName === matchingBookieBet.eventName && bet.selectionName !== matchingBookieBet.selectionName);

          // Subtract the stakes of the other bets with the same eventName
          otherBetsSameEvent.forEach(otherBet => {
            const otherSizeMatched = sanitizeNumber(otherBet.sizeMatched);
            bookieExposure -= otherSizeMatched;
          });

        } else if (matchingBookieBet.side === 0) { // Bookie BACK
          // For BACK, just add the sizeMatched as exposure
          bookieExposure = sanitizedBookieSizeMatched;
        }

        totalBookieExposure += isNaN(bookieExposure) ? 0 : bookieExposure;
      });

      // Ensure the exposure values are valid numbers
      totalBetfairExposure = isNaN(totalBetfairExposure) ? 0 : totalBetfairExposure;
      totalBookieExposure = isNaN(totalBookieExposure) ? 0 : totalBookieExposure;

      // Create a key combining eventDescription and selectionName
      const exposureKey = `${betfairBet.eventDescription}_${betfairBet.selectionName}`;

      // Check if the selection already exists in the map
      if (exposureDataMap.has(exposureKey)) {
        // If it exists, add the current exposures to the existing ones
        const existingExposure = exposureDataMap.get(exposureKey);
        existingExposure.totalBetfairExposure += totalBetfairExposure;
        existingExposure.totalBookieExposure += totalBookieExposure;
        exposureDataMap.set(exposureKey, existingExposure);
      } else {
        // If it doesn't exist, create a new entry in the map
        exposureDataMap.set(exposureKey, {
          eventDescription: betfairBet.eventDescription,
          selectionName: betfairBet.selectionName,
          totalBetfairExposure,
          totalBookieExposure
        });
      }
    });

    // Convert the map back to an array
    const exposureData = Array.from(exposureDataMap.values());

    return { betfairData, bookieData, exposureData };
  } catch (error) {
    console.error('Error retrieving data:', error);
    throw new functions.https.HttpsError('internal', 'Error retrieving betting data', error);
  }
});

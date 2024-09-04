import { db } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

const matchedCollection = 'matchedEvents';

// Function to convert a timestamp to a Date object or handle specific date format
const convertToDate = (date) => {
    if (date === '1970-01-01T00:00:00+00:00') {
        return new Date(0); // Unix epoch start
    }
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
    }
    const timestamp = Number(date);
    const timestampDate = new Date(timestamp);
    return isNaN(timestampDate.getTime()) ? null : timestampDate;
};

const processEvent = async (eventId) => {
    const docRef = doc(db, matchedCollection, eventId);
    const eventDoc = await getDoc(docRef);
    const eventData = eventDoc.data();

    if (!eventData || !eventData.dataObject) {
        console.log(`No data found for event ID: ${eventId} or dataObject field is missing`);
        return null;
    }

    return {
        'Event ID': eventId,
        ...eventData.dataObject,
        Date: convertToDate(eventData.dataObject.Date)
    };
};

const processAllEvents = async () => {
    const eventsRef = collection(db, matchedCollection);
    const eventsSnapshot = await getDocs(eventsRef);

    const promises = eventsSnapshot.docs.map(eventDoc => processEvent(eventDoc.id));
    const results = await Promise.all(promises);

    const filteredResults = results.filter(result => result !== null);
    const sortedResults = filteredResults.sort((a, b) => b.Date - a.Date);

    return sortedResults;
};

export { processAllEvents };

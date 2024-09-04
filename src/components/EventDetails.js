import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { getDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

const EventDetails = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const [betfairData, setBetfairData] = useState([]);
    const [bookieData, setBookieData] = useState([]);

    useEffect(() => {
        const fetchEventData = async () => {
            const matchedEventRef = doc(db, 'matchedEvents', eventId);
            const matchedEventDoc = await getDoc(matchedEventRef);

            if (matchedEventDoc.exists()) {
                const matchedEventData = matchedEventDoc.data();
                const { betfairDocIds = [], bookieDocIds = [] } = matchedEventData;

                const betfairPromises = betfairDocIds.map(id => getDoc(doc(db, 'betfair-statement', id)));
                const betfairDocs = await Promise.all(betfairPromises);
                const betfairDataArray = betfairDocs.map(doc => doc.data());
                setBetfairData(betfairDataArray);

                const bookiePromises = bookieDocIds.map(id => getDoc(doc(db, 'bookie-statement', id)));
                const bookieDocs = await Promise.all(bookiePromises);
                const bookieDataArray = bookieDocs.map(doc => doc.data());
                setBookieData(bookieDataArray);
            } else {
                console.error(`No such document with ID: ${eventId}`);
            }
        };

        fetchEventData();
    }, [eventId]);

    const convertToUnixTimestamp = (dateStr) => {
        const dt = new Date(dateStr);
        const unixTimestampMs = dt.getTime();
        return unixTimestampMs;
    };

    const updateEventDate = async () => {
        try {
            // Get the matched event document
            const matchedEventRef = doc(db, 'matchedEvents', eventId);
            const matchedEventDoc = await getDoc(matchedEventRef);

            if (matchedEventDoc.exists()) {
                const matchedEventData = matchedEventDoc.data();
                const { betfairDocIds = [] } = matchedEventData;

                if (betfairDocIds.length > 0) {
                    // Get the first betfair-statement document
                    const betfairDocRef = doc(db, 'betfair-statement', betfairDocIds[0]);
                    const betfairDoc = await getDoc(betfairDocRef);
                    
                    if (betfairDoc.exists()) {
                        const { formattedSettledDate } = betfairDoc.data();

                        // Convert the formattedSettledDate to Unix timestamp
                        const unixTimestamp = convertToUnixTimestamp(formattedSettledDate);

                        // Update the Date in dataObject
                        await updateDoc(matchedEventRef, {
                            "dataObject.Date": unixTimestamp
                        });

                        alert('Event Date updated successfully!');
                    } else {
                        alert('No corresponding betfair-statement document found.');
                    }
                } else {
                    alert('No Betfair Doc IDs found in the event data.');
                }
            } else {
                alert('No matched event document found.');
            }
        } catch (error) {
            console.error('Error updating event date:', error);
            alert('Failed to update the event date. Please try again.');
        }
    };

    const deleteEvent = async () => {
        try {
            const matchedEventRef = doc(db, 'matchedEvents', eventId);
            await deleteDoc(matchedEventRef);
            alert('Event deleted successfully');
            navigate('/');
        } catch (error) {
            console.error('Error deleting event:', error);
            alert('Failed to delete the event. Please try again.');
        }
    };

    const formatNumber = (amount) => {
        if (typeof amount === 'number') {
            return Math.abs(amount).toFixed(2);
        } else if (typeof amount === 'string') {
            amount = amount.replace(',', '');
            if (amount.startsWith('(') && amount.endsWith(')')) {
                amount = amount.slice(1, -1);
            }
            return Math.abs(parseFloat(amount)).toFixed(2);
        } else if (amount === null || amount === undefined || amount === "") {
            return '0.00';
        } else {
            return '0.00';
        }
    };

    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    return (
        <div>
            <h1>Event Details for Event ID: {eventId}</h1> 
            <button 
                onClick={deleteEvent}
                className="delete-button"
            >
                Delete Event
            </button>
            <button 
                onClick={updateEventDate}
                className="update-date-button"
            >
                Update Data Object
            </button>
            <h2>Betfair Statement</h2>
            {betfairData.length > 0 ? (
                <table>
                    <thead>
                        <tr>
                            <th>Bet Description</th>
                            <th>Event</th>
                            <th>Selection</th>
                            <th>Average Price</th>
                            <th>Bet Size</th>
                            <th>Credit Amount</th>
                            <th>Debit Amount</th>
                            <th>Placed Date</th>
                            <th>Settled Date</th>
                            <th>Win/Lose</th>
                        </tr>
                    </thead>
                    <tbody>
                        {betfairData.map((data, index) => (
                            <tr key={index}>
                                <td>{data.event.betDescription}</td>
                                <td>{data.bookieMatchEvent}</td>
                                <td>{data.bookieMatchSelection}</td>
                                <td>{formatNumber(data.averagePrice)}</td>
                                <td>{formatNumber(data.betSize)}</td>
                                <td>{formatNumber(data.creditAmount)}</td>
                                <td>{formatNumber(data.debitAmount)}</td>
                                <td>{data.formattedPlacedDate} {data.formattedPlacedTime}</td>
                                <td>{data.formattedSettledDate} {data.formattedSettledTime}</td>
                                <td>{data.winLose}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p>No data available for Betfair Statement.</p>
            )}

            <h2>Bookie Statement</h2>
            {bookieData.length > 0 ? (
                <table>
                    <thead>
                        <tr>
                            <th>Event Name</th>
                            <th>Selection Name</th>
                            <th>Market Name</th>
                            <th>PNL</th>
                            <th>Balance (TL001)</th>
                            <th>Action</th>
                            <th>Action Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bookieData.map((data, index) => (
                            <tr key={index}>
                                <td>{data.description.eventName}</td>
                                <td>{data.description.selectionName}</td>
                                <td>{data.description.marketName}</td>
                                <td>{formatNumber(data.pnl)}</td>
                                <td>{formatNumber(data.balance)}</td>
                                <td>{data.actionDisplayName}</td>
                                <td>{formatDate(data.date)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p>No data available for Bookie Statement.</p>
            )}
        </div>
    );
};

export default EventDetails;

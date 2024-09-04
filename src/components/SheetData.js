import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const SheetData = () => {
  const [betfairData, setBetfairData] = useState([]);
  const [bookieData, setBookieData] = useState([]);
  const [exposureData, setExposureData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBetfairDataVisible, setIsBetfairDataVisible] = useState(true);
  const [isBookieDataVisible, setIsBookieDataVisible] = useState(true);
  const [isExposureDataVisible, setIsExposureDataVisible] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const functions = getFunctions();
        const getBettingData = httpsCallable(functions, 'getBettingData');

        // Fetch Betfair, Bookie, and Exposure data
        const result = await getBettingData();
        const newBetfairData = result.data.betfairData;
        const newBookieData = result.data.bookieData;
        const newExposureData = result.data.exposureData;

        // Only update state if data has changed
        if (JSON.stringify(newBetfairData) !== JSON.stringify(betfairData)) {
          setBetfairData(newBetfairData);
        }

        if (JSON.stringify(newBookieData) !== JSON.stringify(bookieData)) {
          setBookieData(newBookieData);
        }

        if (JSON.stringify(newExposureData) !== JSON.stringify(exposureData)) {
          setExposureData(newExposureData);
        }

        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    // Fetch data immediately when component mounts
    fetchData();

    // Set up interval to fetch data every 15 seconds
    const intervalId = setInterval(fetchData, 15000);

    // Cleanup the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, [betfairData, bookieData, exposureData]);

  // Count the number of rows in the provided data array
  const calculateTotal = (data) => {
    if (!data || data.length === 0) return 0;
    return data.length;
  };

  const renderBetfairTable = () => (
    <table>
      <thead>
        <tr>
          <th>side</th>
          <th>averageOddsMatched</th>
          <th>odds</th>
          <th>eventDescription</th>
          <th>eventTypeDescription</th>
          <th>selectionName</th>
          <th>stake</th>
          <th>marketLink</th>
          <th>matchedDate</th>
          <th>placedDate</th>
          <th>sportId</th>
        </tr>
      </thead>
      <tbody>
        {betfairData.map((row, index) => (
          <tr key={index}>
            <td>{row.side}</td>
            <td>{row.averageOddsMatched}</td>
            <td>{row.odds}</td>
            <td>{row.eventDescription}</td>
            <td>{row.eventTypeDescription}</td>
            <td>{row.selectionName}</td>
            <td>{row.stake}</td>
            <td>{row.marketLink}</td>
            <td>{row.matchedDate}</td>
            <td>{row.placedDate}</td>
            <td>{row.sportId}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderBookieTable = () => (
    <table>
      <thead>
        <tr>
          <th>side</th>
          <th>averagePrice</th>
          <th>betPlacedDate</th>
          <th>eventName</th>
          <th>eventTypeId</th>
          <th>marketBettingType</th>
          <th>marketTime</th>
          <th>marketType</th>
          <th>orderStatus</th>
          <th>price</th>
          <th>profitLoss</th>
          <th>selectionName</th>
          <th>sizeMatched</th>
        </tr>
      </thead>
      <tbody>
        {bookieData.map((row, index) => (
          <tr key={index}>
            <td>{row.side}</td>
            <td>{row.averagePrice}</td>
            <td>{new Date(row.betPlacedDate).toLocaleString()}</td>
            <td>{row.eventName}</td>
            <td>{row.eventTypeId}</td>
            <td>{row.marketBettingType}</td>
            <td>{new Date(row.marketTime).toLocaleString()}</td>
            <td>{row.marketType}</td>
            <td>{row.orderStatus}</td>
            <td>{row.price}</td>
            <td>{row.profitLoss}</td>
            <td>{row.selectionName}</td>
            <td>{row.sizeMatched}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderExposureTable = () => (
    <table>
      <thead>
        <tr>
          <th>Event Description</th> {/* Add this line */}
          <th>Selection Name</th>
          <th>Betfair Exposure</th>
          <th>Bookie Exposure</th>
        </tr>
      </thead>
      <tbody>
        {exposureData.map((row, index) => (
          <tr key={index}>
            <td>{row.eventDescription}</td> {/* Add this line */}
            <td>{row.selectionName}</td>
            <td>{row.totalBetfairExposure !== undefined && !isNaN(row.totalBetfairExposure) ? row.totalBetfairExposure.toFixed(2) : 'N/A'}</td>
            <td>{row.totalBookieExposure !== undefined && !isNaN(row.totalBookieExposure) ? row.totalBookieExposure.toFixed(2) : 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ); 
  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Analysist Picks</h2>

      <div>
        <h3 onClick={() => setIsBetfairDataVisible(!isBetfairDataVisible)}>
          Latest Betfair Statement (Total: {calculateTotal(betfairData)}) {isBetfairDataVisible ? '▲' : '▼'}
        </h3>
        {isBetfairDataVisible && renderBetfairTable()}
      </div>

      <div>
        <h3 onClick={() => setIsBookieDataVisible(!isBookieDataVisible)}>
          Latest Bookie Statement (Total: {calculateTotal(bookieData)}) {isBookieDataVisible ? '▲' : '▼'}
        </h3>
        {isBookieDataVisible && renderBookieTable()}
      </div>

      <div>
        <h3 onClick={() => setIsExposureDataVisible(!isExposureDataVisible)}>
          Exposure Data (Total: {calculateTotal(exposureData)}) {isExposureDataVisible ? '▲' : '▼'}
        </h3>
        {isExposureDataVisible && renderExposureTable()}
      </div>
    </div>
  );
};

export default SheetData;

// App.js
import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { db, auth } from './firebase'; // Ensure you have the correct firebase configuration
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { processAllEvents } from './utils/matchEvents';
import DataSummary from './components/DataSummary';
import TrialBalance from './components/TrialBalance';
import EventDetails from './components/EventDetails';
import SheetData from './components/SheetData';
import LoginComponent from './components/LoginComponent';
import ProtectedRoute from './components/ProtectedRoute'; // Import the ProtectedRoute component
import './App.css';


const Home = () => {
  const [eventsData, setEventsData] = useState([]);
  const [groupedData, setGroupedData] = useState({});
  const [summaryData, setSummaryData] = useState({
    bookieCount: 0,
    betfairCount: 0,
    betListCount: 0,
    matchedEventsCount: 0,
    betfairBetListCount: 0,
    bookieBalance: 0,
    betfairBalance: 0,
  });
  const [totalTradeGP, setTotalTradeGP] = useState(0);
  const [expandedDates, setExpandedDates] = useState([]);
  const [nonTradingTotalsBookie, setNonTradingTotalsBookie] = useState(0);
  const [nonTradingTotalsBetfair, setNonTradingTotalsBetfair] = useState(0);

  const navigate = useNavigate();

  const parseAmount = (amountStr) => {
    if (!amountStr) return 0.0;
    amountStr = amountStr.replace(',', '');
    if (amountStr.startsWith('(') && amountStr.endsWith(')')) {
      return parseFloat(amountStr.slice(1, -1));
    }
    return parseFloat(amountStr);
  };

  useEffect(() => {
    const fetchSummaryData = async () => {
      let bookieCount = 0;
      let betfairCount = 0;
      let bookieBalance = 0;
      let betfairBalance = 0;
      let betListCount = 0;
      let matchedEventsCount = 0;
      let betfairBetListCount = 0;

      const bookieSnapshot = await getDocs(collection(db, 'bookie-statement'));
      bookieSnapshot.forEach((doc) => {
        const data = doc.data();
        bookieCount += 1;
        if (data.pnl) {
          bookieBalance += data.pnl;
        }
      });

      const betfairSnapshot = await getDocs(collection(db, 'betfair-statement'));
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

      const betListSnapshot = await getDocs(collection(db, 'bet-list'));
      betListCount = betListSnapshot.size;

      const matchedEventsSnapshot = await getDocs(collection(db, 'matchedEvents'));
      matchedEventsCount = matchedEventsSnapshot.size;

      const betfairBetListSnapshot = await getDocs(collection(db, 'betfair-bet-list'));
      betfairBetListCount = betfairBetListSnapshot.size;

      setSummaryData({
        bookieCount,
        betfairCount,
        betListCount,
        matchedEventsCount,
        betfairBetListCount,
        bookieBalance,
        betfairBalance,
      });
    };

    const fetchEventsData = async () => {
      const data = await processAllEvents();
      console.log('Events Data:', data);

      const grouped = data.reduce((acc, event) => {
        const date = new Date(event.Date).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(event);
        return acc;
      }, {});

      const totalGP = data.reduce((sum, event) => sum + parseFloat(event.TradeGP), 0);
      setTotalTradeGP(totalGP);

      setGroupedData(grouped);
      setEventsData(data);
    };

    const fetchNonTradingTotals = async () => {
      let totalNonTradingBookie = 0;
      let totalNonTradingBetfair = 0;

      // Filter and sum pnl from Bookie non-trading records
      const bookieQuery = query(
        collection(db, 'bookie-statement'),
        where('action', 'in', ['CREDIT', 'OPEN', 'TRANSFER_DOWN'])
      );
      const bookieSnapshot = await getDocs(bookieQuery);
      bookieSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.pnl) {
          totalNonTradingBookie += data.pnl;
        }
      });

      // Filter and sum creditAmount from Betfair non-trading records within the event object
      const betfairSnapshot = await getDocs(collection(db, 'betfair-statement'));
      betfairSnapshot.forEach((doc) => {
        const data = doc.data();
        const event = data.event; // Access the event object

        if (event && event.nameAndSelectionName === 'Cross accounts transfer') {
          if (data.creditAmount) {
            totalNonTradingBetfair += parseAmount(data.creditAmount);
          }
        }
      });

      setNonTradingTotalsBookie(totalNonTradingBookie);
      setNonTradingTotalsBetfair(totalNonTradingBetfair);
    };

    fetchSummaryData();
    fetchEventsData();
    fetchNonTradingTotals();
  }, []);

  const formatNumber = (num) => (num ? num.toFixed(2) : '0.00');
  const formatDate = (date) => {
    if (date === 'Invalid Date') return date;
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString();
  };

  const handleRowClick = (eventId) => {
    navigate(`/event/${eventId}`);
  };

  const toggleDateExpansion = (date) => {
    setExpandedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const renderSummaryRow = (date, events) => {
    const totalBetfairBalance = events.reduce((sum, event) => sum + parseFloat(event['Betfair Balance']), 0);
    const totalBookieBalance = events.reduce((sum, event) => sum + parseFloat(event['Bookie Balance']), 0);
    const totalTradeGP = events.reduce((sum, event) => sum + parseFloat(event.TradeGP), 0);
    const totalCount = events.reduce((sum, event) => sum + event['Total Count'], 0);

    const rowClass = totalBetfairBalance < 0 ? 'summary-row-negative' : 'summary-row-positive';

    return (
      <React.Fragment key={date}>
        <tr onClick={() => toggleDateExpansion(date)} className={rowClass} style={{ cursor: 'pointer' }}>
          <td>{date}</td>
          <td>{formatNumber(totalBetfairBalance)}</td>
          <td>{formatNumber(totalBookieBalance)}</td>
          <td>{formatNumber(totalTradeGP)}</td>
          <td>{totalCount}</td>
        </tr>
        {expandedDates.includes(date) && (
          <tr>
            <td colSpan="5">
              <table className="nested-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Betfair Balance</th>
                    <th>Bookie Balance</th>
                    <th>TradeGP</th>
                    <th>Betfair Count</th>
                    <th>Bookie Count</th>
                    <th>Total Count</th>
                    <th>Date</th>
                    <th>Sport</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={index} onClick={() => handleRowClick(event['Event ID'])}>
                      <td>{event['Event ID']}</td>
                      <td>{formatNumber(parseFloat(event['Betfair Balance']))}</td>
                      <td>{formatNumber(parseFloat(event['Bookie Balance']))}</td>
                      <td>{formatNumber(parseFloat(event['TradeGP']))}</td>
                      <td>{event['Betfair Count']}</td>
                      <td>{event['Bookie Count']}</td>
                      <td>{event['Total Count']}</td>
                      <td>{formatDate(event['Date'])}</td>
                      <td>{event['Sport']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const renderTotalsRow = () => {
    const totalBetfairBalance = Object.values(groupedData).flat().reduce((sum, event) => sum + parseFloat(event['Betfair Balance']), 0);
    const totalBookieBalance = Object.values(groupedData).flat().reduce((sum, event) => sum + parseFloat(event['Bookie Balance']), 0);
    const totalTradeGP = Object.values(groupedData).flat().reduce((sum, event) => sum + parseFloat(event.TradeGP), 0);
    const totalCount = Object.values(groupedData).flat().reduce((sum, event) => sum + event['Total Count'], 0);

    const betfairGrandTotal = totalBetfairBalance + nonTradingTotalsBetfair;
    const bookieGrandTotal = totalBookieBalance + nonTradingTotalsBookie;

    return (
      <>
        <tr className="totals-row">
          <td><strong> Trading Totals</strong></td>
          <td>{formatNumber(totalBetfairBalance)}</td>
          <td>{formatNumber(totalBookieBalance)}</td>
          <td>{formatNumber(totalTradeGP)}</td>
          <td colSpan="2">{totalCount}</td>
        </tr>
        <tr className="totals-row">
          <td><strong>Non-Trading Totals (Bookie)</strong></td>
          <td colSpan="4">{formatNumber(nonTradingTotalsBookie)}</td>
        </tr>
        <tr className="totals-row">
          <td><strong>Non-Trading Totals (Betfair)</strong></td>
          <td colSpan="4">{formatNumber(nonTradingTotalsBetfair)}</td>
        </tr>
        <tr className="totals-row">
          <td><strong>Grand Total (Bookie)</strong></td>
          <td colSpan="4">{formatNumber(bookieGrandTotal)}</td>
        </tr>
        <tr className="totals-row">
          <td><strong>Grand Total (Betfair)</strong></td>
          <td colSpan="4">{formatNumber(betfairGrandTotal)}</td>
        </tr>
      </>
    );
  };

  return (
    <div>
      <h1>Events Data</h1>
      <DataSummary
        bookieCount={summaryData.bookieCount}
        betfairCount={summaryData.betfairCount}
        betListCount={summaryData.betListCount}
        matchedEventsCount={summaryData.matchedEventsCount}
        betfairBetListCount={summaryData.betfairBetListCount}
        bookieBalance={summaryData.bookieBalance}
        betfairBalance={summaryData.betfairBalance}
      />
      <div className="total-trade-gp">
        <strong>Total Trade GP:</strong> {formatNumber(totalTradeGP)}
      </div>
      {Object.keys(groupedData).length > 0 ? (
        <table className="events-data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Betfair Balance</th>
              <th>Bookie Balance</th>
              <th>Trade GP</th>
              <th>Total Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedData).map(([date, events]) =>
              renderSummaryRow(date, events)
            )}
            {renderTotalsRow()}
          </tbody>
        </table>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        console.log('User signed out');
        setIsAuthenticated(false);
      })
      .catch((error) => {
        console.error('Error signing out: ', error);
      });
  };

  return (
    <div>
      {!isAuthenticated ? (
        <LoginComponent onLoginSuccess={() => setIsAuthenticated(true)} />
      ) : (
        <>
          <nav>
            <ul>
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/trial-balance">Trial Balance</Link>
              </li>
              <li>
                <Link to="/sheet-data">Awaiting Results</Link>
              </li>
              <li>
                <button className="logout-button" onClick={handleLogout}>Logout</button>
              </li>
            </ul>
          </nav>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/trial-balance"
              element={
                <ProtectedRoute roleRequired="admin">
                  <TrialBalance />
                </ProtectedRoute>
              }
            />
            <Route path="/sheet-data" element={<SheetData />} />
            <Route path="/event/:eventId" element={<EventDetails />} />
          </Routes>
        </>
      )}
    </div>
  );
};

export default App;
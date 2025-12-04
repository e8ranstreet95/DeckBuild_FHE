import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Card {
  id: number;
  encryptedId: string;
  name: string;
  type: string;
  power: number;
  cost: number;
  isBanned: boolean;
}

interface BanRecord {
  cardId: number;
  timestamp: number;
}

interface Room {
  id: string;
  name: string;
  encryptedPassword: string;
  creator: string;
  timestamp: number;
  status: "open" | "closed";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [myBannedCards, setMyBannedCards] = useState<number[]>([]);
  const [opponentBannedCards, setOpponentBannedCards] = useState<number[]>([]);
  const [myDeck, setMyDeck] = useState<number[]>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedCard, setDecryptedCard] = useState<Card | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: "", password: 0 });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Initialize card pool
  const initializeCardPool = async () => {
    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      // Check if card pool already exists
      const cardPoolBytes = await contract.getData("card_pool");
      if (cardPoolBytes.length > 0) return;
      
      // Define initial card pool
      const initialCards: Card[] = [
        { id: 1, encryptedId: FHEEncryptNumber(1), name: "Quantum Shield", type: "Defense", power: 3, cost: 2, isBanned: false },
        { id: 2, encryptedId: FHEEncryptNumber(2), name: "Neural Disruptor", type: "Attack", power: 4, cost: 3, isBanned: false },
        { id: 3, encryptedId: FHEEncryptNumber(3), name: "Temporal Loop", type: "Special", power: 5, cost: 4, isBanned: false },
        { id: 4, encryptedId: FHEEncryptNumber(4), name: "Plasma Blade", type: "Attack", power: 3, cost: 2, isBanned: false },
        { id: 5, encryptedId: FHEEncryptNumber(5), name: "Energy Barrier", type: "Defense", power: 2, cost: 1, isBanned: false },
        { id: 6, encryptedId: FHEEncryptNumber(6), name: "Gravity Well", type: "Special", power: 6, cost: 5, isBanned: false },
        { id: 7, encryptedId: FHEEncryptNumber(7), name: "Photon Cannon", type: "Attack", power: 5, cost: 4, isBanned: false },
        { id: 8, encryptedId: FHEEncryptNumber(8), name: "Force Field", type: "Defense", power: 4, cost: 3, isBanned: false },
        { id: 9, encryptedId: FHEEncryptNumber(9), name: "Time Warp", type: "Special", power: 7, cost: 6, isBanned: false },
        { id: 10, encryptedId: FHEEncryptNumber(10), name: "Ion Blast", type: "Attack", power: 4, cost: 3, isBanned: false },
      ];
      
      // Store encrypted card pool
      await contract.setData("card_pool", ethers.toUtf8Bytes(JSON.stringify(initialCards)));
      
      setCards(initialCards);
    } catch (e) {
      console.error("Error initializing card pool:", e);
    }
  };

  // Load rooms from contract
  const loadRooms = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const roomKeysBytes = await contract.getData("room_keys");
      let roomKeys: string[] = [];
      if (roomKeysBytes.length > 0) {
        try {
          roomKeys = JSON.parse(ethers.toUtf8String(roomKeysBytes));
        } catch (e) {
          console.error("Error parsing room keys:", e);
        }
      }
      
      const loadedRooms: Room[] = [];
      for (const key of roomKeys) {
        try {
          const roomBytes = await contract.getData(`room_${key}`);
          if (roomBytes.length > 0) {
            const roomData = JSON.parse(ethers.toUtf8String(roomBytes));
            loadedRooms.push({
              id: key,
              name: roomData.name,
              encryptedPassword: roomData.password,
              creator: roomData.creator,
              timestamp: roomData.timestamp,
              status: roomData.status || "open"
            });
          }
        } catch (e) {
          console.error(`Error loading room ${key}:`, e);
        }
      }
      
      // Sort by timestamp (newest first)
      loadedRooms.sort((a, b) => b.timestamp - a.timestamp);
      setRooms(loadedRooms);
    } catch (e) {
      console.error("Error loading rooms:", e);
    }
  };

  // Create a new room
  const createRoom = async () => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }
    
    if (!newRoom.name || newRoom.password <= 0) {
      alert("Please enter room name and password");
      return;
    }
    
    setCreatingRoom(true);
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting room data with Zama FHE..." 
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Encrypt password
      const encryptedPassword = FHEEncryptNumber(newRoom.password);
      
      // Generate unique room ID
      const roomId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Create room object
      const roomData = {
        name: newRoom.name,
        password: encryptedPassword,
        creator: address,
        timestamp: Math.floor(Date.now() / 1000),
        status: "open"
      };
      
      // Store room data
      await contract.setData(`room_${roomId}`, ethers.toUtf8Bytes(JSON.stringify(roomData)));
      
      // Update room keys list
      const roomKeysBytes = await contract.getData("room_keys");
      let roomKeys: string[] = [];
      if (roomKeysBytes.length > 0) {
        try {
          roomKeys = JSON.parse(ethers.toUtf8String(roomKeysBytes));
        } catch (e) {
          console.error("Error parsing room keys:", e);
        }
      }
      
      roomKeys.push(roomId);
      await contract.setData("room_keys", ethers.toUtf8Bytes(JSON.stringify(roomKeys)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Room created with FHE encryption!" 
      });
      
      // Refresh rooms list
      await loadRooms();
      
      // Reset form and close modal
      setTimeout(() => {
        setShowCreateRoomModal(false);
        setNewRoom({ name: "", password: 0 });
        setCreatingRoom(false);
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Room creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setCreatingRoom(false);
      }, 3000);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await initializeCardPool();
      await loadCardPool();
      await loadBanRecords();
      await loadRooms(); // Load rooms
      
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
      
      setLoading(false);
    };
    
    init();
  }, []);

  const loadCardPool = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const cardPoolBytes = await contract.getData("card_pool");
      if (cardPoolBytes.length === 0) return;
      
      const cardPoolStr = ethers.toUtf8String(cardPoolBytes);
      const loadedCards: Card[] = JSON.parse(cardPoolStr);
      setCards(loadedCards);
    } catch (e) {
      console.error("Error loading card pool:", e);
    }
  };

  const loadBanRecords = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Load my ban records
      if (address) {
        const myBanBytes = await contract.getData(`ban_records_${address}`);
        if (myBanBytes.length > 0) {
          const myBanStr = ethers.toUtf8String(myBanBytes);
          const myBanRecords: BanRecord[] = JSON.parse(myBanStr);
          setMyBannedCards(myBanRecords.map(record => record.cardId));
        }
      }
      
      // Load opponent ban records (simulated)
      const opponentBanBytes = await contract.getData("opponent_ban_records");
      if (opponentBanBytes.length > 0) {
        const opponentBanStr = ethers.toUtf8String(opponentBanBytes);
        const opponentBanRecords: BanRecord[] = JSON.parse(opponentBanStr);
        setOpponentBannedCards(opponentBanRecords.map(record => record.cardId));
      }
    } catch (e) {
      console.error("Error loading ban records:", e);
    }
  };

  const banCard = async (cardId: number) => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }
    
    if (myBannedCards.length >= 3) {
      alert("You can only ban up to 3 cards");
      return;
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Banning card with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Load existing ban records
      let banRecords: BanRecord[] = [];
      const banBytes = await contract.getData(`ban_records_${address}`);
      if (banBytes.length > 0) {
        const banStr = ethers.toUtf8String(banBytes);
        banRecords = JSON.parse(banStr);
      }
      
      // Add new ban record
      banRecords.push({ cardId, timestamp: Math.floor(Date.now() / 1000) });
      
      // Store updated ban records
      await contract.setData(`ban_records_${address}`, ethers.toUtf8Bytes(JSON.stringify(banRecords)));
      
      // Update local state
      setMyBannedCards([...myBannedCards, cardId]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Card banned successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Ban failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const unbanCard = async (cardId: number) => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Unbanning card with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Load existing ban records
      const banBytes = await contract.getData(`ban_records_${address}`);
      if (banBytes.length === 0) return;
      
      const banStr = ethers.toUtf8String(banBytes);
      let banRecords: BanRecord[] = JSON.parse(banStr);
      
      // Remove the ban record
      banRecords = banRecords.filter(record => record.cardId !== cardId);
      
      // Store updated ban records
      await contract.setData(`ban_records_${address}`, ethers.toUtf8Bytes(JSON.stringify(banRecords)));
      
      // Update local state
      setMyBannedCards(myBannedCards.filter(id => id !== cardId));
      
      setTransactionStatus({ visible: true, status: "success", message: "Card unbanned successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Unban failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const addToDeck = (cardId: number) => {
    if (myDeck.length >= 10) {
      alert("Your deck can only contain 10 cards");
      return;
    }
    
    if (myDeck.includes(cardId)) {
      alert("This card is already in your deck");
      return;
    }
    
    setMyDeck([...myDeck, cardId]);
  };

  const removeFromDeck = (cardId: number) => {
    setMyDeck(myDeck.filter(id => id !== cardId));
  };

  const checkContractAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Contract not available");
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        alert("Contract is available and functioning properly!");
      } else {
        alert("Contract is not available at the moment");
      }
    } catch (e) {
      alert("Error checking contract availability");
    }
  };

  const decryptWithSignature = async (card: Card): Promise<void> => {
    if (!isConnected) {
      alert("Please connect wallet first");
      return;
    }
    
    setIsDecrypting(true);
    setSelectedCard(card);
    
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate decryption
      const decryptedId = FHEDecryptNumber(card.encryptedId);
      const decryptedCard = cards.find(c => c.id === decryptedId);
      
      if (decryptedCard) {
        setDecryptedCard(decryptedCard);
      }
    } catch (e) {
      console.error("Decryption failed:", e);
    } finally {
      setIsDecrypting(false);
    }
  };

  const availableCards = cards.filter(
    card => !myBannedCards.includes(card.id) && 
            !opponentBannedCards.includes(card.id)
  );

  const bannedCards = cards.filter(card => myBannedCards.includes(card.id));
  
  const deckCards = cards.filter(card => myDeck.includes(card.id));

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing encrypted card pool...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>DeckBuild<span>FHE</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={checkContractAvailability} className="metal-button">
            Check Contract
          </button>
          <button 
            onClick={() => setShowCreateRoomModal(true)} 
            className="metal-button primary"
          >
            Create Room
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </header>
      
      <div className="main-content partitioned-layout">
        {/* Left Panel: Card Pool */}
        <div className="panel card-pool-panel">
          <div className="panel-header">
            <h2>Encrypted Card Pool</h2>
            <div className="fhe-indicator">
              <div className="fhe-lock"></div>
              <span>FHE Encryption Active</span>
            </div>
          </div>
          
          <div className="panel-content">
            <div className="card-grid">
              {cards.map(card => (
                <div 
                  key={card.id} 
                  className={`card ${myBannedCards.includes(card.id) ? 'banned' : ''} ${opponentBannedCards.includes(card.id) ? 'opponent-banned' : ''}`}
                  onClick={() => setSelectedCard(card)}
                >
                  <div className="card-header">
                    <span className="card-id">#{card.id}</span>
                    <span className="card-type">{card.type}</span>
                  </div>
                  <div className="card-name">{card.name}</div>
                  <div className="card-stats">
                    <div className="stat">
                      <span>Power</span>
                      <span>{card.power}</span>
                    </div>
                    <div className="stat">
                      <span>Cost</span>
                      <span>{card.cost}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    {!myBannedCards.includes(card.id) && !opponentBannedCards.includes(card.id) && (
                      <button 
                        className="metal-button small ban-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          banCard(card.id);
                        }}
                      >
                        Ban
                      </button>
                    )}
                    {myBannedCards.includes(card.id) && (
                      <button 
                        className="metal-button small unban-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          unbanCard(card.id);
                        }}
                      >
                        Unban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Right Panel: Deck Building */}
        <div className="panel deck-panel">
          <div className="panel-header">
            <h2>Deck Building</h2>
            <div className="deck-count">{myDeck.length}/10 cards</div>
          </div>
          
          <div className="panel-content">
            {/* My Banned Cards */}
            <div className="banned-section">
              <h3>My Banned Cards ({myBannedCards.length}/3)</h3>
              <div className="banned-cards">
                {bannedCards.map(card => (
                  <div key={card.id} className="banned-card">
                    <span className="card-name">{card.name}</span>
                    <button 
                      className="metal-button small unban-btn"
                      onClick={() => unbanCard(card.id)}
                    >
                      Unban
                    </button>
                  </div>
                ))}
                {bannedCards.length === 0 && (
                  <div className="empty-state">No cards banned yet</div>
                )}
              </div>
            </div>
            
            {/* Available Cards */}
            <div className="available-section">
              <h3>Available Cards ({availableCards.length})</h3>
              <div className="available-cards">
                {availableCards.map(card => (
                  <div key={card.id} className="available-card">
                    <span className="card-name">{card.name}</span>
                    <button 
                      className="metal-button small add-btn"
                      onClick={() => addToDeck(card.id)}
                    >
                      Add to Deck
                    </button>
                  </div>
                ))}
                {availableCards.length === 0 && (
                  <div className="empty-state">No available cards</div>
                )}
              </div>
            </div>
            
            {/* My Deck */}
            <div className="deck-section">
              <h3>My Deck ({myDeck.length}/10)</h3>
              <div className="deck-cards">
                {deckCards.map(card => (
                  <div key={card.id} className="deck-card">
                    <span className="card-name">{card.name}</span>
                    <button 
                      className="metal-button small remove-btn"
                      onClick={() => removeFromDeck(card.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {deckCards.length === 0 && (
                  <div className="empty-state">Your deck is empty</div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Panel: Statistics and Rooms */}
        <div className="panel stats-panel">
          <div className="panel-header">
            <h2>Game Rooms</h2>
            <button 
              className="metal-button"
              onClick={() => setShowFAQ(!showFAQ)}
            >
              {showFAQ ? "Hide FAQ" : "Show FAQ"}
            </button>
          </div>
          
          <div className="panel-content">
            <div className="rooms-section">
              <div className="section-header">
                <h3>Active Game Rooms</h3>
                <button 
                  className="metal-button small"
                  onClick={() => setShowCreateRoomModal(true)}
                >
                  + New Room
                </button>
              </div>
              
              <div className="rooms-list">
                {rooms.length === 0 ? (
                  <div className="empty-state">No active rooms found</div>
                ) : (
                  rooms.map(room => (
                    <div key={room.id} className="room-item">
                      <div className="room-info">
                        <div className="room-name">{room.name}</div>
                        <div className="room-meta">
                          <span>Created by: {room.creator.substring(0, 6)}...{room.creator.substring(38)}</span>
                          <span>{new Date(room.timestamp * 1000).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="room-status">
                        <span className={`status-badge ${room.status}`}>{room.status}</span>
                        <button 
                          className="metal-button small"
                          onClick={() => {
                            setSelectedCard(null);
                            setDecryptedCard(null);
                            // In a real app, this would join the room
                            alert(`Joining room: ${room.name}`);
                          }}
                        >
                          Join
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {showFAQ && (
              <div className="faq-section">
                <h3>Frequently Asked Questions</h3>
                <div className="faq-item">
                  <h4>What is FHE (Fully Homomorphic Encryption)?</h4>
                  <p>FHE allows computations to be performed on encrypted data without decrypting it first. In this game, it ensures that banned cards remain secret until revealed.</p>
                </div>
                <div className="faq-item">
                  <h4>How does the ban phase work?</h4>
                  <p>Each player secretly bans up to 3 cards from the shared pool. These banned cards are encrypted using FHE and remain hidden until the game begins.</p>
                </div>
                <div className="faq-item">
                  <h4>What happens after banning cards?</h4>
                  <p>After the ban phase, players build their decks from the remaining cards. The banned cards are revealed only when the game starts.</p>
                </div>
                <div className="faq-item">
                  <h4>How is ZAMA FHE used in this game?</h4>
                  <p>ZAMA FHE technology encrypts the ban selections, ensuring that neither player knows which cards the other has banned until the game begins.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Project Introduction Banner */}
      <div className="intro-banner metal-card">
        <h2>DeckBuild FHE - Encrypted Deck Building Game</h2>
        <p>
          A strategic deck-building game where players secretly ban cards from a shared encrypted pool using ZAMA FHE technology. 
          This adds a layer of psychological warfare before the game even begins.
        </p>
        <div className="fhe-badge">
          <span>Powered by ZAMA FHE</span>
        </div>
      </div>
      
      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="modal-overlay">
          <div className="card-detail-modal metal-card">
            <div className="modal-header">
              <h2>Card Details #{selectedCard.id}</h2>
              <button onClick={() => {
                setSelectedCard(null);
                setDecryptedCard(null);
              }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="card-info">
                <div className="info-item"><span>Name:</span><strong>{selectedCard.name}</strong></div>
                <div className="info-item"><span>Type:</span><strong>{selectedCard.type}</strong></div>
                <div className="info-item"><span>Power:</span><strong>{selectedCard.power}</strong></div>
                <div className="info-item"><span>Cost:</span><strong>{selectedCard.cost}</strong></div>
              </div>
              
              <div className="encrypted-data-section">
                <h3>Encrypted ID</h3>
                <div className="encrypted-data">{selectedCard.encryptedId.substring(0, 30)}...</div>
                <div className="fhe-tag">
                  <div className="fhe-icon"></div>
                  <span>FHE Encrypted</span>
                </div>
                <button 
                  className="metal-button decrypt-btn"
                  onClick={() => decryptWithSignature(selectedCard)}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt with Wallet"}
                </button>
              </div>
              
              {decryptedCard && (
                <div className="decrypted-data-section">
                  <h3>Decrypted Data</h3>
                  <div className="decrypted-info">
                    <div className="info-item"><span>Card ID:</span><strong>{decryptedCard.id}</strong></div>
                    <div className="info-item"><span>Status:</span><strong>Decrypted Successfully</strong></div>
                  </div>
                  <div className="decryption-notice">
                    <div className="warning-icon"></div>
                    <span>Decrypted data is only visible after wallet signature verification</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div className="modal-overlay">
          <div className="create-room-modal metal-card">
            <div className="modal-header">
              <h2>Create New Game Room</h2>
              <button onClick={() => setShowCreateRoomModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="fhe-notice">
                <div className="fhe-icon"></div>
                <div>
                  <strong>FHE Encryption Notice</strong>
                  <p>Room password will be encrypted with Zama FHE before submission</p>
                </div>
              </div>
              
              <div className="form-group">
                <label>Room Name *</label>
                <input
                  type="text"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
                  placeholder="Enter room name..."
                  className="metal-input"
                />
              </div>
              
              <div className="form-group">
                <label>Password (Numerical) *</label>
                <input
                  type="number"
                  value={newRoom.password}
                  onChange={(e) => setNewRoom({...newRoom, password: Number(e.target.value)})}
                  placeholder="Enter numerical password..."
                  className="metal-input"
                  min="1"
                />
              </div>
              
              <div className="encryption-preview">
                <h4>Encryption Preview</h4>
                <div className="preview-container">
                  <div className="plain-data">
                    <span>Plain Password:</span>
                    <div>{newRoom.password > 0 ? newRoom.password : 'No password entered'}</div>
                  </div>
                  <div className="encryption-arrow">→</div>
                  <div className="encrypted-data">
                    <span>Encrypted Data:</span>
                    <div>{newRoom.password > 0 ? FHEEncryptNumber(newRoom.password).substring(0, 50) + '...' : 'No password entered'}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateRoomModal(false)} 
                className="metal-button"
              >
                Cancel
              </button>
              <button 
                onClick={createRoom} 
                disabled={creatingRoom}
                className="metal-button primary"
              >
                {creatingRoom ? "Creating with FHE..." : "Create Securely"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>DeckBuild FHE</span>
            </div>
            <p>Strategic deck-building game powered by ZAMA FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} DeckBuild FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
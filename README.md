# DeckBuild_FHE: A Strategic Deck-Building Game with Encrypted Card Pools ♠️🃏

DeckBuild_FHE is an innovative deck-building game that elevates player strategy through the use of **Zama's Fully Homomorphic Encryption technology**. In this game, players can secretly manipulate their decks during the Ban/Pick phase from an encrypted card pool, introducing a layer of tactical depth that is unique to the genre.

## The Challenge of Strategic Gameplay

In traditional deck-building games, players often find themselves limited by the visibility of available cards and the predictability of their opponents' strategies. This openness can dilute strategic depth, making it challenging for players to create unique tactics and maintain the element of surprise. As a result, many players seek a more engaging experience where their strategic intentions remain concealed until the perfect moment.

## How Fully Homomorphic Encryption Elevates Gameplay

Fully Homomorphic Encryption (FHE) allows for computations to be performed on encrypted data without needing to decrypt it first. This means that players can engage with an encrypted card pool and strategize their game choices without revealing their intentions. We utilize Zama's open-source FHE libraries, such as **Concrete** and **TFHE-rs**, to ensure that our game's mechanics allow for privacy-preserving interactions. This transparency in gameplay deeply enhances the psychological aspects of card games, resulting in an exhilarating experience.

## Core Functionalities

- **Encrypted Ban/Pick Phase:** Players can secretly "ban" cards from the encrypted pool, preventing their opponents from accessing them. 
- **Strategic Depth:** Players need to anticipate opponents’ strategies while safeguarding their own, all while interacting with the encrypted data.
- **Competitive Gameplay:** The game emphasizes strategy and psychological warfare, making it perfect for competitive card game enthusiasts.

## Technology Stack

The following technologies form the backbone of DeckBuild_FHE:

- **Frontend:** React.js for a dynamic user interface
- **Smart Contracts:** Solidity for Ethereum-based logic
- **Confidential Computing:** Zama's **Concrete** and **TFHE-rs** libraries for FHE capabilities
- **Blockchain:** Ethereum for decentralized gameplay
- **Development Tools:** Hardhat for smart contract deployment and testing

## Directory Structure

Here’s how the project is organized:

```
DeckBuild_FHE/
├── contracts/
│   └── DeckBuild_FHE.sol
├── src/
│   ├── App.js
│   ├── components/
│   └── hooks/
├── tests/
│   └── DeckBuild_FHE.test.js
├── package.json
└── README.md
```

## Getting Started

To get started with DeckBuild_FHE, ensure you have the following dependencies installed on your machine:

- **Node.js:** Required for running the front-end and scripts.
- **Hardhat:** A development environment to compile, deploy, test, and debug Ethereum software.

Follow these steps to set up your environment:

1. **Download the project files directly from the source.** 
2. Open your terminal and navigate to the project directory.
3. Run the command below to install necessary dependencies including Zama’s FHE libraries:
   ```bash
   npm install
   ```

## Compile, Test & Run

Once you've set up the environment, you're ready to compile and run the project. Follow these commands:

1. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run tests to ensure functionality:**
   ```bash
   npx hardhat test
   ```

3. **Launch the application:**
   ```bash
   npm start
   ```

With these commands, you can seamlessly compile, verify, and run DeckBuild_FHE. Dive into the world of encrypted strategic gameplay!

## 🎮 Code Snippet

Here's a simple example of how we implement the Ban/Pick phase using Zama's technology:

```solidity
pragma solidity ^0.8.0;

import "Concrete.sol";

contract DeckBuild_FHE {
    using Concrete for *; // Import Zama's FHE library

    mapping(address => bytes[]) internal playerCards;
    bytes[] public encryptedCardPool;

    function banCard(bytes memory card) public {
        // Logic to ban a card from the encrypted pool
        require(isInCardPool(card), "Card not available for ban.");
        // Perform FHE operation to 'ban' the card
        encryptedCardPool = encryptedCardPool.ban(card);
    }
    
    function pickCard(bytes memory card) public {
        // Logic for picking a card
        playerCards[msg.sender].push(card);
    }
}
```

In this code, we showcase how players interact with the encrypted card pool, demonstrating the simplicity of integrating FHE into gameplay.

## Acknowledgements

**Powered by Zama:** A special thanks to the Zama team for their groundbreaking work in homomorphic encryption and the open-source tools they provide. Their commitment to enhancing security in blockchain applications enables us to create innovative gameplay experiences that prioritize player privacy and strategy.

---
Whether you're a seasoned card-game strategist or a newcomer looking to dive into a world of encrypted challenge, DeckBuild_FHE provides an engaging and secure platform. Join the ranks of players who thrive on hidden intentions and strategic depth!

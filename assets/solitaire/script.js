const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let gameState = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []]
};

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value, faceUp: false });
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function createCardElement(card, draggable = true, isTopmost = true) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.faceUp ? 'face-up' : 'face-down'}`;

    // If the card is not the topmost, add the obscured class
    if (!isTopmost) {
        cardElement.classList.add('obscured');
    }

    cardElement.draggable = draggable && card.faceUp;

    const valueElement = document.createElement('div');
    valueElement.className = `value ${['♥', '♦'].includes(card.suit) ? 'red' : 'black'}`;
    valueElement.innerHTML = `${card.value}<small>${card.suit}</small>`;
    cardElement.appendChild(valueElement);

    cardElement.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(card));
    });

    return cardElement;
}


function renderTableau() {
    gameState.tableau.forEach((pile, index) => {
        const pileElement = document.getElementById(`tableau-${index}`);
        pileElement.innerHTML = '';
        pile.forEach((card, cardIndex) => {
            const isTopmost = cardIndex === pile.length - 1;
            const cardElement = createCardElement(card, true, isTopmost);
            cardElement.style.top = `${cardIndex * 20}px`; // Reduced spacing between cards
            cardElement.style.zIndex = cardIndex; // Ensure proper stacking
            pileElement.appendChild(cardElement);
        });
    });
}

function renderPile(pile, elementId) {
    const pileElement = document.getElementById(elementId);
    pileElement.innerHTML = '';
    pile.forEach((card, index) => {
        const isTopmost = index === pile.length - 1;
        const cardElement = createCardElement(card, true, isTopmost);
        if (!elementId.startsWith("foundation-")) {
            cardElement.style.top = `${index * 20}px`;
        } else {
            cardElement.style.top = `0px`;
        }
        pileElement.appendChild(cardElement);
    });
}

function moveToWaste() {
    if (gameState.stock.length > 0) {
        const card = gameState.stock.pop();
        card.faceUp = true;
        gameState.waste.push(card);
    } else {
        gameState.stock = gameState.waste.reverse().map(card => ({ ...card, faceUp: false }));
        gameState.waste = [];
    }
    renderPiles();
    saveGameState();
}

function renderPiles() {
    renderPile(gameState.stock, 'stock');
    renderPile(gameState.waste, 'waste');
    gameState.foundations.forEach((foundation, index) => {
        renderPile(foundation, `foundation-${index}`);
    });
    renderTableau();
}

function getCardValue(card) {
    return VALUES.indexOf(card.value);
}

function canAddToFoundation(card, foundation) {
    if (foundation.length === 0) {
        return card.value === 'A';
    }
    const topCard = foundation[foundation.length - 1];
    return card.suit === topCard.suit && getCardValue(card) === getCardValue(topCard) + 1;
}

function canAddToTableau(card, tableauPile) {
    if (tableauPile.length === 0) {
        return card.value === 'K';
    }
    const topCard = tableauPile[tableauPile.length - 1];
    return ['♠', '♣'].includes(card.suit) !== ['♠', '♣'].includes(topCard.suit) &&
           getCardValue(card) === getCardValue(topCard) - 1;
}

function findCard(card) {
    for (let i = 0; i < gameState.tableau.length; i++) {
        const index = gameState.tableau[i].findIndex(c => c.suit === card.suit && c.value === card.value);
        if (index !== -1) {
            return { pile: gameState.tableau[i], index, type: 'tableau', pileIndex: i };
        }
    }
    const wasteIndex = gameState.waste.findIndex(c => c.suit === card.suit && c.value === card.value);
    if (wasteIndex !== -1) {
        return { pile: gameState.waste, index: wasteIndex, type: 'waste' };
    }
    for (let i = 0; i < gameState.foundations.length; i++) {
        const index = gameState.foundations[i].findIndex(c => c.suit === card.suit && c.value === card.value);
        if (index !== -1) {
            return { pile: gameState.foundations[i], index, type: 'foundation', pileIndex: i };
        }
    }
    return null;
}

function handleDrop(e, targetPile) {
    e.preventDefault();
    const cardData = JSON.parse(e.dataTransfer.getData('text/plain'));
    const sourceInfo = findCard(cardData);

    if (!sourceInfo) return;

    let cardsToMove = sourceInfo.pile.slice(sourceInfo.index);
    let moveValid = false;

    if (targetPile.startsWith('foundation')) {
        const foundationIndex = parseInt(targetPile.split('-')[1]);
        if (cardsToMove.length === 1 && canAddToFoundation(cardsToMove[0], gameState.foundations[foundationIndex])) {
            gameState.foundations[foundationIndex].push(cardsToMove[0]);
            sourceInfo.pile.splice(sourceInfo.index, 1);
            moveValid = true;
        }
    } else if (targetPile.startsWith('tableau')) {
        const tableauIndex = parseInt(targetPile.split('-')[1]);
        if (canAddToTableau(cardsToMove[0], gameState.tableau[tableauIndex])) {
            gameState.tableau[tableauIndex].push(...cardsToMove);
            sourceInfo.pile.splice(sourceInfo.index);
            moveValid = true;
        }
    }

    // Reveal the card below only if the move was valid
    if (moveValid && sourceInfo.type === 'tableau' && sourceInfo.index > 0) {
        sourceInfo.pile[sourceInfo.index - 1].faceUp = true;
    }

    renderPiles();
    saveGameState();
}

function saveGameState() {
    localStorage.setItem('klondikeSolitaireState', JSON.stringify(gameState));
}

function loadGameState() {
    const savedState = localStorage.getItem('klondikeSolitaireState');
    if (savedState) {
        gameState = JSON.parse(savedState);
        renderPiles();
    } else {
        initGame();
    }
}

function clearGameState() {
    localStorage.removeItem('klondikeSolitaireState');
    initGame();
}

function initGame() {
    gameState.stock = createDeck();
    shuffleDeck(gameState.stock);
    gameState.waste = [];
    gameState.foundations = [[], [], [], []];
    gameState.tableau = Array(7).fill().map(() => []);

    // Deal cards to tableau
    for (let i = 0; i < 7; i++) {
        for (let j = i; j < 7; j++) {
            gameState.tableau[j].push(gameState.stock.pop());
        }
        gameState.tableau[i][gameState.tableau[i].length - 1].faceUp = true;
    }

    renderPiles();
    saveGameState();
}

document.addEventListener('DOMContentLoaded', () => {
    loadGameState();

    const stockElement = document.getElementById('stock');
    stockElement.addEventListener('click', moveToWaste);

    const resetButton = document.getElementById('reset-button');
    resetButton.addEventListener('click', clearGameState);

    // Event listeners for waste, foundations, and tableau as before
    const wasteElement = document.getElementById('waste');
    wasteElement.addEventListener('dragover', (e) => e.preventDefault());
    wasteElement.addEventListener('drop', (e) => handleDrop(e, 'waste'));

    gameState.foundations.forEach((_, index) => {
        const foundationElement = document.getElementById(`foundation-${index}`);
        foundationElement.addEventListener('dragover', (e) => e.preventDefault());
        foundationElement.addEventListener('drop', (e) => handleDrop(e, `foundation-${index}`));
    });

    gameState.tableau.forEach((_, index) => {
        const tableauElement = document.getElementById(`tableau-${index}`);
        tableauElement.addEventListener('dragover', (e) => e.preventDefault());
        tableauElement.addEventListener('drop', (e) => handleDrop(e, `tableau-${index}`));
    });
});
import { 
  db, 
  doc,
  collection, 
  onSnapshot,
  runTransaction,
  serverTimestamp,
  increment
} from './firebase.js';

import { 
  myParticipations, 
  renderMyMatches 
} from './history.js';

import { 
  setSafeText 
} from './utils.js';

export let allTournaments = [];
let currentMatchMode = 'All'; 
let currentMatchStatus = 'All'; 
let currentViewId = 'home';
let activeJoinTournament = null;
let activeDetailsTournamentId = null;

// Split popup states
let popupOpen = false;
let activePopupTournamentId = null;
let lastPopupOpenTime = 0;

// Countdown Interval state variables
let countdownEngineInterval = null;

// --- DYNAMIC FORMATTING UTILITIES ---

export function formatFriendlyDate(dateStr) {
  if (!dateStr) return '—';
  // Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(month, 10) - 1;
    let monthName = months[monthIndex] || month;
    if (monthIndex === 6) {
      monthName = "July";
    }
    return `${parseInt(day, 10)} ${monthName} ${year}`;
  }
  return dateStr;
}

export function format12HourTime(timeStr) {
  if (!timeStr) return '—';
  // Check if it already has AM/PM
  if (/(AM|PM)/i.test(timeStr)) {
    return timeStr.toUpperCase();
  }
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    let hh = parseInt(parts[0], 10);
    const mm = parts[1].trim().substring(0, 2);
    if (!isNaN(hh)) {
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      hh = hh ? hh : 12;
      const hhStr = String(hh).padStart(2, '0');
      return `${hhStr}:${mm} ${ampm}`;
    }
  }
  return timeStr;
}

// --- DYNAMIC CLIPBOARD UTILITY ---

window.copyValue = function(text, label) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    window.showToast(`✓ ${label} Copied`, "success");
  }).catch((err) => {
    console.error("Clipboard copy operation failed:", err);
  });
};

// --- WINNER SPLIT CALCULATOR & FLOATING POPUP ENGINE ---

function getWinnerSplitArray(t) {
  const prize = Number(t.winnerPrize || 0);
  const mode = (t.matchType || t.mode || 'Solo').toLowerCase();

  const splitData = t.prizeSplit || t.winnerSplit;
  if (splitData) {
    if (Array.isArray(splitData)) {
      return splitData.map(Number);
    }
    if (typeof splitData === 'string') {
      return splitData.split(',').map(s => Number(s.trim()));
    }
    if (typeof splitData === 'object') {
      return Object.values(splitData).map(Number);
    }
  }

  let numPlayers = 1;
  if (mode === 'duo') numPlayers = 2;
  if (mode === 'squad') numPlayers = 4;

  const share = prize / numPlayers;
  return Array(numPlayers).fill(share);
}

window.showWinnerSplitPopup = function(event, tournamentId) {
  const evt = event || window.event;
  if (evt) {
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    if (evt.preventDefault) evt.preventDefault();
  }

  if (popupOpen && activePopupTournamentId === tournamentId) {
    window.closeWinnerSplitPopup();
    return;
  }

  window.closeWinnerSplitPopup();

  const t = allTournaments.find(tourn => tourn.id === tournamentId);
  if (!t) return;

  let overlay = document.getElementById('winner-split-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'winner-split-overlay';
    overlay.className = "fixed inset-0 z-[99] bg-transparent cursor-default";
    
    const dismissHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.closeWinnerSplitPopup();
    };

    overlay.addEventListener('click', dismissHandler);
    document.body.appendChild(overlay);
  }

  let popup = document.getElementById('winner-split-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'winner-split-popup';
    popup.className = "fixed z-[100] hidden glass-luxury p-3.5 rounded-2xl border border-gold/30 shadow-[0_4px_25px_rgba(212,175,55,0.3)] text-xs font-grotesk w-52 transition-all duration-200 opacity-0 scale-95 pointer-events-none";
    
    const content = document.createElement('div');
    content.id = 'winner-split-content';
    content.className = 'space-y-1.5';
    popup.appendChild(content);
    
    document.body.appendChild(popup);
  }

  if (!popup.dataset.hasStopPropagation) {
    const stopPropagationHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    popup.addEventListener('click', stopPropagationHandler);
    popup.dataset.hasStopPropagation = "true";
  }

  const content = document.getElementById('winner-split-content');
  if (!content) return;

  const totalPrize = Number(t.winnerPrize || 0);
  const mode = (t.matchType || t.mode || 'Solo').toLowerCase();
  const split = getWinnerSplitArray(t);

  let html = `
    <div class="text-center font-bold text-slate-300 border-b border-gold/10 pb-1.5 mb-1.5 uppercase tracking-wider text-[10px] font-grotesk">
      Winner Prize
    </div>
    <div class="flex justify-between font-bold text-slate-300 mb-2 font-grotesk">
      <span>Total Prize</span>
      <span class="text-yellow-400 font-mono">₹${totalPrize}</span>
    </div>
    <div class="space-y-1.5 font-grotesk">
  `;

  split.forEach((val, index) => {
    let label = `Player ${index + 1}`;
    if (mode === 'solo' || split.length === 1) {
      label = 'Player';
    }
    html += `
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>${label}</span>
        <span class="text-white font-mono font-bold">₹${val.toFixed(0)}</span>
      </div>
    `;
  });

  html += `</div>`;
  content.innerHTML = html;

  popup.classList.remove('hidden');

  requestAnimationFrame(() => {
    const currentTarget = evt ? (evt.currentTarget || evt.target) : null;
    if (!currentTarget) return;

    const rect = currentTarget.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 208;
    const popupHeight = popup.offsetHeight || 120;

    let left = rect.left + (rect.width - popupWidth) / 2;
    let top = rect.top - popupHeight - 8;

    if (left < 10) left = 10;
    if (left + popupWidth > window.innerWidth - 10) {
      left = window.innerWidth - popupWidth - 10;
    }
    if (top < 10) {
      top = rect.bottom + 8;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    popup.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
    popup.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
  });

  popupOpen = true;
  activePopupTournamentId = tournamentId;
  lastPopupOpenTime = Date.now();
};

window.closeWinnerSplitPopup = function() {
  popupOpen = false;
  activePopupTournamentId = null;
  const popup = document.getElementById('winner-split-popup');
  if (popup) {
    popup.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    popup.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
    setTimeout(() => {
      if (!popupOpen) {
        popup.classList.add('hidden');
      }
    }, 200);
  }
  
  const overlay = document.getElementById('winner-split-overlay');
  if (overlay) {
    overlay.remove();
  }
};

// --- REAL-TIME DETAILED COUNTDOWN ENGINE ---

function parseDateTimeString(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    let combinedStr = `${dateStr} ${timeStr}`;
    let ms = Date.parse(combinedStr);
    if (isNaN(ms)) {
      let normalizedDate = dateStr.replace(/-/g, '/');
      ms = Date.parse(`${normalizedDate} ${timeStr}`);
    }
    return isNaN(ms) ? null : new Date(ms);
  } catch (e) {
    return null;
  }
}

function startCountdownEngine() {
  if (countdownEngineInterval) clearInterval(countdownEngineInterval);
  countdownEngineInterval = setInterval(() => {
    allTournaments.forEach(t => {
      const fullEl = document.getElementById(`full-countdown-${t.id}`);
      const historyEl = document.getElementById(`full-countdown-history-${t.id}`);

      const elementsToUpdate = [];
      if (fullEl) elementsToUpdate.push(fullEl);
      if (historyEl) elementsToUpdate.push(historyEl);

      if (elementsToUpdate.length === 0) return;

      const targetDate = parseDateTimeString(t.date, t.time);
      if (!targetDate) {
        return;
      }

      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        elementsToUpdate.forEach(el => {
          el.innerHTML = `
            <div class="text-[10px] font-bold text-red-400 font-grotesk flex items-center gap-1 bg-red-950/20 border border-red-500/30 px-2.5 py-1 rounded-xl">
              <span class="live-dot" style="width:6px;height:6px;background:#ef4444;"></span>
              <span>MATCH IN PROGRESS</span>
            </div>
          `;
        });
        if (t.status === 'upcoming') {
          t.status = 'live';
        }
        return;
      }

      const secs = Math.floor((diff / 1000) % 60);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const hrs = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      const dStr = String(days).padStart(2, '0');
      const hStr = String(hrs).padStart(2, '0');
      const mStr = String(mins).padStart(2, '0');
      const sStr = String(secs).padStart(2, '0');

      elementsToUpdate.forEach(el => {
        el.innerHTML = `
          <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
            <span class="block text-[13px] font-bold text-white leading-none">${dStr}</span>
            <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">DAYS</span>
          </div>
          <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
            <span class="block text-[13px] font-bold text-white leading-none">${hStr}</span>
            <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">HRS</span>
          </div>
          <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
            <span class="block text-[13px] font-bold text-white leading-none">${mStr}</span>
            <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">MINS</span>
          </div>
          <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
            <span class="block text-[13px] font-bold text-white leading-none">${sStr}</span>
            <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">SECS</span>
          </div>
        `;
      });
    });
  }, 1000);
}

// --- MODAL CONTROLLERS & TRIGGER BINDINGS ---

window.openJoinModal = function(tournamentId) {
  if (!window.currentUserDoc) {
    window.showToast("Please login to join matches!", "error");
    const appContainer = document.getElementById('app-container');
    const authContainer = document.getElementById('auth-container');
    if (appContainer) appContainer.classList.add('hidden');
    if (authContainer) authContainer.classList.remove('hidden');
    window.toggleAuthForms('login');
    return;
  }

  activeJoinTournament = allTournaments.find(t => t.id === tournamentId);
  if (!activeJoinTournament) return;

  setSafeText('join-modal-tourn-name', activeJoinTournament.title);
  setSafeText('join-modal-fee', `₹${activeJoinTournament.entryFee}`);

  const gameNameInput = document.getElementById('join-gamename');
  const uidInput = document.getElementById('join-uid');

  if (gameNameInput) gameNameInput.value = "";
  if (uidInput) uidInput.value = "";

  const modal = document.getElementById('join-modal');
  if (modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
};

window.closeJoinModal = function() {
  activeJoinTournament = null;
  const modal = document.getElementById('join-modal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

window.openRoomModal = function(tournamentId) {
  const tourn = allTournaments.find(t => t.id === tournamentId);
  if (!tourn) return;

  const vPanel = document.getElementById('room-content-visible');
  const hPanel = document.getElementById('room-content-hidden');

  if (!vPanel || !hPanel) return;

  const isJoined = myParticipations.some(p => p.tournamentId === tourn.id);
  const showId = isJoined && (tourn.roomIdPublished === true || String(tourn.roomIdPublished) === 'true') && tourn.roomId;
  const showPw = isJoined && (tourn.roomPasswordPublished === true || String(tourn.roomPasswordPublished) === 'true') && (tourn.roomPass || tourn.roomPassword);

  if (showId || showPw) {
    vPanel.innerHTML = `
      <p class="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Credentials Active</p>
      <div class="bg-black/60 p-4 rounded-xl border border-gold/15 space-y-3 text-left font-grotesk">
        <div class="flex justify-between items-center border-b border-gold/10 pb-2">
          <div>
            <strong class="text-white font-mono text-sm tracking-wider">ID : ${showId ? tourn.roomId : "HIDDEN 🔒"}</strong>
          </div>
          ${showId ? `<button onclick="window.copyValue('${tourn.roomId}', 'Room ID')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
        </div>
        <div class="flex justify-between items-center pt-1">
          <div>
            <strong class="text-white font-mono text-sm tracking-wider">PW : ${showPw ? (tourn.roomPass || tourn.roomPassword || "No Password") : "HIDDEN 🔒"}</strong>
          </div>
          ${showPw ? `<button onclick="window.copyValue('${tourn.roomPass || tourn.roomPassword || ''}', 'Password')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>` : ''}
        </div>
      </div>
    `;
    vPanel.classList.remove('hidden');
    hPanel.classList.add('hidden');
  } else {
    hPanel.innerHTML = `
      <i class="fa-solid fa-lock text-slate-500 text-3xl my-2"></i>
      <div class="flex flex-col gap-2 items-center text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
        <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
        <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
      </div>
      <p class="text-xs text-slate-400 font-medium mt-2">Room ID and Password will be displayed here once enabled by the Admin before the match starts.</p>
    `;
    vPanel.classList.add('hidden');
    hPanel.classList.remove('hidden');
  }

  const modal = document.getElementById('room-details-modal');
  if (modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
  }
};

window.closeRoomModal = function() {
  const modal = document.getElementById('room-details-modal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

const joinFormEl = document.getElementById('join-form');
if (joinFormEl) {
  joinFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeJoinTournament || !window.currentUserDoc) return;

    const btn = document.getElementById('join-confirm-btn');
    if (!btn) return;

    btn.disabled = true;
    btn.innerText = "Processing...";

    const gameNameInput = document.getElementById('join-gamename');
    const uidInput = document.getElementById('join-uid');

    const gameName = gameNameInput ? gameNameInput.value.trim() : "";
    const bgmiUid = uidInput ? uidInput.value.trim() : "";

    if (!/^\d+$/.test(bgmiUid)) {
      window.showToast("UID must contain only numbers.", "error");
      btn.disabled = false;
      btn.innerText = "Confirm Join";
      return;
    }

    const fee = Number(activeJoinTournament.entryFee);

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", window.currentUserDoc.uid);
        const tournRef = doc(db, "tournaments", activeJoinTournament.id);

        const userSnap = await transaction.get(userRef);
        const tournSnap = await transaction.get(tournRef);

        if (!userSnap.exists() || !tournSnap.exists()) {
          throw new Error("Data sync error. Refetching references.");
        }

        const u = userSnap.data();
        const t = tournSnap.data();

        const currentBalance = parseFloat(u.walletBalance || u.wallet || 0);

        if (currentBalance < fee) {
          throw new Error("Insufficient wallet balance.");
        }

        const max = Number(t.maxPlayers) || 100;
        const joinedCount = Number(t.joinedCount) || 0;
        if (joinedCount >= max) {
          throw new Error("Match slots are full.");
        }

        const participantId = `${activeJoinTournament.id}_${u.uid}`;
        const partRef = doc(db, "matchParticipants", participantId);
        const partSnap = await transaction.get(partRef);

        if (partSnap.exists()) {
          throw new Error("You are already registered.");
        }

        const nextBalance = currentBalance - fee;

        transaction.update(userRef, {
          wallet: nextBalance,
          walletBalance: nextBalance
        });

        transaction.update(tournRef, { joinedCount: increment(1) });

        const txnRef = doc(collection(db, "walletTransactions"));
        transaction.set(txnRef, {
          userId: u.uid,
          type: "match_entry",
          amount: -fee,
          reason: `Joined: ${t.title}`,
          timestamp: serverTimestamp()
        });

        transaction.set(partRef, {
          userId: u.uid,
          userName: u.username,
          email: u.email,
          profilePhoto: u.profileImage || "",
          gameName: gameName,
          bgmiUid: bgmiUid,
          tournamentId: activeJoinTournament.id,
          tournamentName: t.title,
          mode: t.mode || "Solo",
          entryFee: fee,
          date: t.date || "",
          time: t.time || "",
          joinedAt: serverTimestamp(),
          status: "upcoming"
        });
      });

      window.showToast("Successfully joined the battle!", "success");
      window.closeJoinModal();
      window.switchView('my-matches');
    } catch (err) {
      window.showToast(err.message, "error");
      console.error("Match join failure:", err);
    } finally {
      btn.disabled = false;
      btn.innerText = "Confirm Join";
    }
  });
}

// --- POPUP DETAILS ENGINE RENDERING ---

export function updateMatchDetailsModalContent(tournamentId) {
  const t = allTournaments.find(tourn => tourn.id === tournamentId);
  if (!t) return;

  const DEFAULT_BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop";
  const bannerSrc = (t.banner && t.banner.trim() !== '') ? t.banner : DEFAULT_BANNER;

  setSafeText('md-popup-title', t.title);
  setSafeText('md-popup-mode', t.matchType || t.mode || "Solo");
  setSafeText('md-popup-map', t.map || "ERANGEL");
  setSafeText('md-popup-date', formatFriendlyDate(t.date));
  setSafeText('md-popup-time', format12HourTime(t.time));
  setSafeText('md-popup-prize', `₹${t.prizePool || 0}`);
  setSafeText('md-popup-perkill', `₹${t.perKill || 0}`);
  setSafeText('md-popup-fee', `₹${t.entryFee || 0}`);

  const winnersEl = document.getElementById('md-popup-winners');
  if (winnersEl) {
    winnersEl.innerHTML = `₹${t.winnerPrize || 0} <i class="fa-solid fa-circle-info text-[10px] opacity-75"></i>`;
  }

  const winnersBtn = document.getElementById('md-popup-winners-btn');
  if (winnersBtn) {
    const newBtn = winnersBtn.cloneNode(true);
    if (winnersBtn.parentNode) {
      winnersBtn.parentNode.replaceChild(newBtn, winnersBtn);
    }
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.showWinnerSplitPopup(e, t.id);
    });
  }

  const imgEl = document.getElementById('md-popup-banner');
  if (imgEl) imgEl.src = bannerSrc;

  const descSec = document.getElementById('md-popup-desc-sec');
  const descEl = document.getElementById('md-popup-description');
  const descriptionText = t.description || t.mapDescription || '';
  if (descSec && descEl) {
    if (descriptionText.trim() !== '') {
      descSec.classList.remove('hidden');
      descEl.innerText = descriptionText;
    } else {
      descSec.classList.add('hidden');
    }
  }

  const rulesSec = document.getElementById('md-popup-rules-sec');
  const rulesEl = document.getElementById('md-popup-rules');
  const rulesText = t.rules || t.matchRules || '';
  if (rulesSec && rulesEl) {
    if (rulesText.trim() !== '') {
      rulesSec.classList.remove('hidden');
      rulesEl.innerText = rulesText;
    } else {
      rulesSec.classList.add('hidden');
    }
  }

  const isJoined = myParticipations.some(p => p.tournamentId === t.id);

  const roomSec = document.getElementById('md-popup-room-sec');
  if (roomSec) {
    let statusLabel = '';
    let statusCls = '';
    let bodyHtml = '';
    const showId = isJoined && (t.roomIdPublished === true || String(t.roomIdPublished) === 'true') && t.roomId;
    const showPw = isJoined && (t.roomPasswordPublished === true || String(t.roomPasswordPublished) === 'true') && (t.roomPass || t.roomPassword);

    if (showId || showPw) {
      statusLabel = "Released";
      statusCls = "bg-emerald-500/10 border border-emerald-500 text-emerald-400";
      bodyHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div class="bg-purple-950/40 p-3 rounded-xl border border-purple-500/15 flex justify-between items-center font-grotesk">
            <span class="text-white font-mono text-sm tracking-wider">ID : ${showId ? t.roomId : "HIDDEN 🔒"}</span>
            ${showId ? '<button onclick="window.copyValue(\'' + t.roomId + '\', \'Room ID\')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>' : ''}
          </div>
          <div class="bg-purple-950/40 p-3 rounded-xl border border-purple-500/15 flex justify-between items-center font-grotesk">
            <span class="text-white font-mono text-sm tracking-wider">PW : ${showPw ? (t.roomPass || t.roomPassword || "No Password") : "HIDDEN 🔒"}</span>
            ${showPw ? '<button onclick="window.copyValue(\'' + (t.roomPass || t.roomPassword || '') + '\', \'Password\')" class="px-2.5 py-1 bg-[#d4af37]/10 hover:bg-[#d4af37] text-[#d4af37] hover:text-black rounded-lg border border-[#d4af37]/30 text-[10px] font-bold uppercase transition-all flex items-center gap-1">📋 Copy</button>' : ''}
          </div>
        </div>
      `;
    } else if (isJoined) {
      statusLabel = "Awaiting";
      statusCls = "bg-yellow-500/10 border border-yellow-500 text-yellow-400 animate-pulse";
      bodyHtml = `
        <div class="space-y-3 pt-1 text-center font-grotesk">
          <div class="flex justify-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
          </div>
          <p class="text-xs text-slate-400 italic">Room ID & Password will be displayed here once enabled by the Admin before the match starts.</p>
        </div>
      `;
    } else {
      statusLabel = "Locked";
      statusCls = "bg-red-500/10 border border-red-500 text-red-400";
      bodyHtml = `
        <div class="space-y-3 pt-1 text-center font-grotesk">
          <div class="flex justify-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider py-1 font-mono">
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">ID : HIDDEN 🔒</span>
            <span class="bg-black/40 px-2.5 py-1 rounded border border-purple-500/5">PW : HIDDEN 🔒</span>
          </div>
          <p class="text-xs text-slate-400 italic">Unlock Room credentials after joining this match roster.</p>
        </div>
      `;
    }

    roomSec.innerHTML = `
      <h5 class="text-xs font-bold uppercase text-purple-300 tracking-widest flex items-center justify-between border-b border-purple-500/10 pb-2">
        <span><i class="fa-solid fa-key mr-1.5 text-gold"></i> Room Credentials</span>
        <span class="text-[9px] px-2 py-0.5 rounded font-black ${statusCls}">${statusLabel}</span>
      </h5>
      ${bodyHtml}
    `;
  }

  const btnContainer = document.getElementById('md-popup-join-btn-container');
  if (btnContainer) {
    if (isJoined) {
      btnContainer.innerHTML = `
        <button disabled class="w-full py-3 bg-gradient-to-r from-green-400 via-emerald-400 to-emerald-500 text-black font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider opacity-90 cursor-not-allowed flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
          ✅ JOINED
        </button>
      `;
    } else {
      btnContainer.innerHTML = `
        <button onclick="window.closeMatchDetailsModal(); window.openJoinModal('${t.id}')" class="w-full py-3 bg-gradient-to-r from-gold via-gold-light to-gold-dark text-black font-rajdhani font-black rounded-xl text-sm uppercase tracking-wider hover:shadow-[0_0_20px_rgba(212,175,55,0.45)] transition-all">
          <i class="fa-solid fa-bolt mr-1"></i> JOIN — ₹${t.entryFee}
        </button>
      `;
    }
  }
}

window.openMatchDetailsModal = function(tournamentId) {
  activeDetailsTournamentId = tournamentId;
  window.activeDetailsTournamentId = tournamentId;
  const modal = document.getElementById('match-details-modal');
  if (!modal) return;

  updateMatchDetailsModalContent(tournamentId);

  modal.classList.add('modal-active');
  modal.classList.remove('opacity-0', 'pointer-events-none');
};

window.closeMatchDetailsModal = function() {
  activeDetailsTournamentId = null;
  window.activeDetailsTournamentId = null;
  const modal = document.getElementById('match-details-modal');
  if (modal) {
    modal.classList.remove('modal-active');
    modal.classList.add('opacity-0', 'pointer-events-none');
  }
};

// --- CORE BATTLES FEED REDESIGNED RENDERING ---

export function renderMatches() {
  const feed = document.getElementById('matches-feed');
  if (!feed) return;
  
  feed.innerHTML = '';

  const heroCount = document.getElementById('hero-total-count');

  let filtered = allTournaments;

  // Real-time Search configuration filter checks
  const searchInput = document.getElementById('match-search-input');
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (searchQuery !== '') {
    filtered = filtered.filter(t => 
      (t.title || '').toLowerCase().includes(searchQuery) || 
      (t.map || '').toLowerCase().includes(searchQuery) || 
      (t.matchType || t.mode || '').toLowerCase().includes(searchQuery)
    );
  }

  if (currentMatchMode !== 'All') {
    filtered = filtered.filter(t => (t.matchType || t.mode || 'Solo') === currentMatchMode);
  }
  if (currentMatchStatus !== 'All') {
    filtered = filtered.filter(t => (t.status || 'upcoming').toLowerCase() === currentMatchStatus.toLowerCase());
  }

  if (heroCount) {
    heroCount.innerText = `${filtered.length} Match${filtered.length !== 1 ? 'es' : ''}`;
  }

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center gap-3 p-12 bg-[#0c071a]/40 border border-[#8b5cf6]/15 rounded-[24px]">
        <i class="fa-solid fa-shield-slash text-purple-400 text-3xl opacity-60"></i>
        <span class="text-sm font-semibold text-slate-400 uppercase font-grotesk tracking-widest">No Matches Found</span>
      </div>
    `;
    return;
  }

  const DEFAULT_BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop";

  filtered.forEach(t => {
    const max = Number(t.maxPlayers) || 100;
    const joined = Number(t.joinedCount) || 0;
    const remaining = Math.max(0, max - joined);
    const progress = Math.min(100, Math.round((joined / max) * 100));
    const status = (t.status || 'upcoming').toLowerCase();
    const mode = (t.matchType || t.mode || 'Solo');
    const mapName = (t.map || 'ERANGEL');
    const winnerPrize = t.winnerPrize || 0;

    const isJoined = myParticipations.some(p => p.tournamentId === t.id);
    const bannerSrc = (t.banner && t.banner.trim() !== '') ? t.banner : DEFAULT_BANNER;

    const statusCfg = {
      live: { 
        cls: 'badge-live', 
        icon: 'fa-circle text-[8px] animate-pulse', 
        label: 'LIVE', 
        dotHtml: '<span class="live-dot" style="width:6px;height:6px;margin-right:2px;background:#ef4444;box-shadow:0 0 8px #ef4444;"></span>' 
      },
      upcoming: { 
        cls: 'badge-upcoming', 
        icon: 'fa-clock', 
        label: 'UPCOMING', 
        dotHtml: '' 
      },
      completed: { 
        cls: 'badge-completed', 
        icon: 'fa-circle-check', 
        label: 'COMPLETED', 
        dotHtml: '' 
      },
      cancelled: { 
        cls: 'badge-cancelled', 
        icon: 'fa-ban', 
        label: 'CANCELLED', 
        dotHtml: '' 
      },
    };
    
    const sc = statusCfg[status] || statusCfg.upcoming;

    const modeBg = { Solo: '#b8921e', Duo: '#ea580c', Squad: '#e11d48' };

    const showId = isJoined && (t.roomIdPublished === true || String(t.roomIdPublished) === 'true') && t.roomId;
    const showPw = isJoined && (t.roomPasswordPublished === true || String(t.roomPasswordPublished) === 'true') && (t.roomPass || t.roomPassword);

    // Roster Status Pill configuration definitions
    let rosterBadgeCls = "";
    let rosterBadgeText = "";
    if (isJoined) {
      rosterBadgeCls = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
      rosterBadgeText = "● JOINED";
    } else if (remaining <= 0) {
      rosterBadgeCls = "bg-red-500/10 border-red-500/30 text-red-400";
      rosterBadgeText = "● FULL";
    } else {
      rosterBadgeCls = "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
      rosterBadgeText = "● AVAILABLE";
    }

    // Join Match button configurations mapped by active state
    let joinBtnText = `JOIN MATCH • ₹${t.entryFee}`;
    let joinBtnStyle = "bg-gradient-to-r from-gold via-gold-light to-gold-dark text-black glow-gold-btn";
    let joinBtnDisabled = "";

    if (isJoined) {
      joinBtnText = "✅ JOINED";
      joinBtnStyle = "bg-gradient-to-r from-green-400 via-emerald-400 to-emerald-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)] opacity-90 cursor-not-allowed";
      joinBtnDisabled = "disabled";
    }

    const card = document.createElement('div');
    card.className = 'match-card-premium transform hover:-translate-y-1.5 transition-all duration-300';
    card.innerHTML = `
      <!-- TOP BANNER BG SECTION -->
      <div class="relative h-[175px] w-full overflow-hidden shrink-0 bg-[#0c071a] rounded-t-[1.8rem]">
        <img
          src="${bannerSrc}"
          alt="Tournament Banner"
          loading="lazy"
          class="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500"
          style="opacity: 0.9 !important; filter: none !important;"
          onerror="this.src='${DEFAULT_BANNER}';"
        >
        <!-- Very light overlay gradient -->
        <div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50 z-1"></div>
        
        <!-- Overlays Left Header Info -->
        <div class="absolute top-4 left-4 flex flex-col gap-1 z-10 text-left">
          <!-- SOLO Badge -->
          <span class="w-max px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-black font-rajdhani" style="background:${modeBg[mode] || modeBg.Solo};">
            ${mode}
          </span>
          
          <!-- Large Match Name -->
          <h3 class="font-rajdhani font-black text-2xl text-white uppercase tracking-wider drop-shadow-md leading-tight mt-1">${t.title}</h3>
          
          <!-- Map and Game details row -->
          <div class="flex items-center gap-1.5 text-[9px] text-slate-300 font-bold uppercase tracking-wide mt-0.5">
            <span class="flex items-center gap-1"><i class="fa-solid fa-location-dot text-gold text-[8px]"></i> MAP: ${mapName}</span>
            <span class="text-slate-500">|</span>
            <span class="flex items-center gap-1"><i class="fa-solid fa-gamepad text-gold text-[8px]"></i> GAME: BGMI</span>
          </div>
        </div>

        <!-- Top Right Status Badge Overlay -->
        <div class="absolute top-4 right-4 z-10">
          <span class="status-badge ${sc.cls}" style="padding: 4px 10px; font-size: 10px; border-radius: 6px;">
            ${sc.dotHtml}
            <i class="fa-solid ${sc.icon}"></i>
            ${sc.label}
          </span>
        </div>
      </div>

      <!-- MAIN CARD CONTENT BODY -->
      <div class="p-3.5 space-y-2.5 bg-[#05020c]/95 border-t border-[#8b5cf6]/10">

        <!-- Four economics info boxes -->
        <div class="grid grid-cols-4 gap-1.5 text-center font-grotesk">
          <div class="bg-[#120726]/40 border border-gold/10 hover:border-gold/30 p-2 rounded-2xl transition-all flex flex-col justify-between min-h-[52px]">
            <span class="block text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold leading-none">Prize Pool</span>
            <strong class="block text-xs text-yellow-400 font-rajdhani font-black mt-1">🏆 ₹${t.prizePool || 0}</strong>
          </div>
          <div class="bg-[#120726]/40 border border-emerald-500/10 hover:border-emerald-500/30 p-2 rounded-2xl transition-all flex flex-col justify-between min-h-[52px]">
            <span class="block text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold leading-none">Entry Fee</span>
            <strong class="block text-xs text-emerald-400 font-rajdhani font-black mt-1">🎟️ ₹${t.entryFee || 0}</strong>
          </div>
          <div class="bg-[#120726]/40 border border-[#8b5cf6]/10 hover:border-[#8b5cf6]/30 p-2 rounded-2xl transition-all flex flex-col justify-between min-h-[52px]">
            <span class="block text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold leading-none">Per Kill</span>
            <strong class="block text-xs text-purple-400 font-rajdhani font-black mt-1">🎯 ₹${t.perKill || 0}</strong>
          </div>
          <div class="bg-[#120726]/40 border border-blue-500/10 hover:border-blue-500/30 p-2 rounded-2xl transition-all flex flex-col justify-between min-h-[52px] cursor-pointer winner-prize-trigger">
            <span class="block text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold leading-none">Winner Prize</span>
            <strong class="block text-xs text-blue-400 font-rajdhani font-black mt-1 truncate">👑 ₹${winnerPrize} <i class="fa-solid fa-circle-info text-[8px] text-blue-400 ml-0.5"></i></strong>
          </div>
        </div>

        <!-- Player Section (Joined, Remaining Slots, Status Badge, Progress Bar) -->
        <div class="space-y-1.5 px-1 font-grotesk">
          <div class="flex justify-between items-center text-[9.5px] tracking-wide font-bold">
            <div class="flex items-center gap-1.5 text-yellow-500">
              <i class="fa-solid fa-user-group text-gold text-[8px]"></i>
              <span>👥 Joined Players: ${joined} / ${max}</span>
            </div>
            <div class="text-[#c084fc] font-bold">
              Remaining Slots: ${remaining}
            </div>
            <div>
              <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase border ${rosterBadgeCls}">
                ${rosterBadgeText}
              </span>
            </div>
          </div>
          <div class="progress-bar-wrap h-1.5">
            <div class="h-full rounded-full bg-gradient-to-r from-purple-600 via-gold to-yellow-400 transition-all duration-500" style="width: ${progress}%"></div>
          </div>
        </div>

        <!-- Match Starts In / Starts At Lower Panel -->
        <div class="bg-black/40 border border-[#8b5cf6]/20 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-300">
          <div class="flex flex-col gap-1.5 text-left w-full sm:w-auto">
            <div class="flex items-center gap-1.5 text-[10px] font-extrabold text-[#c084fc] uppercase tracking-wider font-grotesk leading-none">
              <i class="fa-regular fa-clock text-xs"></i>
              <span>MATCH STARTS IN</span>
            </div>
            <!-- Countdown grid with 4 digit boxes -->
            <div class="flex items-center gap-1.5 mt-1 font-mono text-center" id="full-countdown-${t.id}">
              <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
                <span class="block text-[13px] font-bold text-white leading-none">00</span>
                <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">DAYS</span>
              </div>
              <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
                <span class="block text-[13px] font-bold text-white leading-none">00</span>
                <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">HRS</span>
              </div>
              <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
                <span class="block text-[13px] font-bold text-white leading-none">00</span>
                <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">MINS</span>
              </div>
              <div class="bg-black/60 border border-purple-500/10 rounded px-2 py-1.5 min-w-[38px]">
                <span class="block text-[13px] font-bold text-white leading-none">00</span>
                <span class="text-[6.5px] text-slate-500 uppercase font-extrabold tracking-tighter block mt-0.5">SECS</span>
              </div>
            </div>
          </div>
          
          <!-- Clean Starts At Alignment (Date & Time on one single line) -->
          <div class="text-right space-y-1.5 border-t sm:border-t-0 sm:border-l border-[#8b5cf6]/20 pt-2.5 sm:pt-0 sm:pl-4 flex flex-col justify-center shrink-0 w-full sm:w-auto">
            <span class="text-[9px] text-gold font-extrabold uppercase tracking-widest block font-grotesk leading-none text-center sm:text-right">
              STARTS AT
            </span>
            <div class="text-[11px] font-grotesk font-bold text-white flex items-center justify-center sm:justify-end gap-1.5 whitespace-nowrap">
              <span>📅 ${formatFriendlyDate(t.date)}</span>
              <span class="text-[#8b5cf6]/60 font-medium">•</span>
              <span class="text-yellow-400 font-mono font-extrabold">🕒 ${format12HourTime(t.time)}</span>
            </div>
          </div>
        </div>

        <!-- Compact Room Credentials Copy Details (Avoid nested backticks compilation conflict) -->
        <div class="bg-[#120924]/60 border border-gold/15 rounded-xl px-2.5 py-1 flex items-center justify-between min-h-[32px] font-grotesk">
          <span class="text-gold font-bold tracking-wider text-[8.5px] uppercase">ROOM DETAILS:</span>
          <div class="flex items-center gap-1.5 text-[11px]">
            ${
              isJoined 
              ? `
                <span class="flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20 text-[9px] font-mono">
                  ID: <strong class="text-white">${showId ? t.roomId : "HIDDEN 🔒"}</strong>
                  ${showId ? '<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue(\'' + t.roomId + '\', \'Room ID\')"></i>' : ''}
                </span>
                <span class="text-purple-500/30">|</span>
                <span class="flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20 text-[9px] font-mono">
                  PW: <strong class="text-white">${showPw ? (t.roomPass || t.roomPassword || "No Password") : "HIDDEN 🔒"}</strong>
                  ${showPw ? '<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue(\'' + (t.roomPass || t.roomPassword || '') + '\', \'Password\')"></i>' : ''}
                </span>
              `
              : `
                <span class="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded border border-purple-500/5 text-[9px] text-slate-500 font-mono">ID: HIDDEN 🔒</span>
                <span class="text-purple-500/20">|</span>
                <span class="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded border border-purple-500/5 text-[9px] text-slate-500 font-mono">PW: HIDDEN 🔒</span>
              `
            }
          </div>
        </div>

        <!-- Action Button Layouts -->
        <div class="grid grid-cols-2 gap-2.5 pt-0.5">
          <button class="py-2 px-2.5 bg-[#120726]/80 hover:bg-[#1a0a36]/90 border border-[#8b5cf6]/40 hover:border-[#a78bfa]/60 text-white rounded-xl font-rajdhani font-black text-xs uppercase tracking-widest flex items-center justify-between transition-all shadow-[0_0_15px_rgba(139,92,246,0.1)] hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] view-details-btn">
            <span><i class="fa-solid fa-eye mr-1"></i> VIEW DETAILS</span>
            <i class="fa-solid fa-arrow-right text-[10px]"></i>
          </button>
          
          <button ${joinBtnDisabled} class="py-2 px-2.5 ${joinBtnStyle} rounded-xl font-rajdhani font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all join-match-btn">
            ${joinBtnText}
          </button>
        </div>

      </div>
    `;

    // Prize Split visual toggle triggers
    const trigger = card.querySelector('.winner-prize-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.showWinnerSplitPopup(e, t.id);
      });
    }

    // Explicit Action button routes targeting details modal
    const viewBtn = card.querySelector('.view-details-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.openMatchDetailsModal(t.id);
      });
    }

    // Join Match trigger bindings
    const joinBtn = card.querySelector('.join-match-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isJoined) return;
        window.openJoinModal(t.id);
      });
    }

    feed.appendChild(card);
  });
}

window.switchView = function(viewId, param = null) {
  // Unconditionally update Bottom Navigation Active State first to prevent highlighting conflicts
  const navButtons = document.querySelectorAll('.nav-mobile-btn');
  navButtons.forEach(btn => btn.classList.remove('text-gold'));
  const indexMap = { 'home': 0, 'matches': 1, 'my-matches': 2, 'wallet': 3, 'profile': 4 };
  if (indexMap[viewId] !== undefined && navButtons[indexMap[viewId]]) {
    navButtons[indexMap[viewId]].classList.add('text-gold');
  }

  if (viewId === 'home' && currentViewId === 'home') {
    window.toggleDrawer(false);
    return;
  }

  currentViewId = viewId;

  // Track the in-app view history stack, maintaining Home as the root screen
  if (!window._isBackNavigation) {
    window._viewHistory = window._viewHistory || ['home'];
    if (viewId === 'home') {
      window._viewHistory = ['home'];
    } else {
      const top = window._viewHistory[window._viewHistory.length - 1];
      if (top !== viewId) {
        window._viewHistory.push(viewId);
      }
    }
  }

  requestAnimationFrame(() => {
    const panels = document.querySelectorAll('.view-panel');
    panels.forEach(v => {
      if (!v.classList.contains('hidden')) {
        v.classList.add('hidden');
      }
    });

    const active = document.getElementById('view-' + viewId);
    if (active) {
      active.classList.remove('hidden');
    }

    if (viewId === 'matches') {
      currentMatchMode = param || 'All';
      
      const titleMap = { 
        'All': 'ALL BATTLES', 
        'Solo': 'SOLO BATTLES', 
        'Duo': 'DUO BATTLES', 
        'Squad': 'SQUAD BATTLES' 
      };
      
      setSafeText('matches-section-title', titleMap[currentMatchMode] || 'ALL BATTLES');

      currentMatchStatus = 'All';
      document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('pill-active'));
      const allPill = document.querySelector('.filter-pill.pill-all');
      if (allPill) allPill.classList.add('pill-active');

      const searchInput = document.getElementById('match-search-input');
      if (searchInput) searchInput.value = '';

      renderMatches();
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  window.toggleDrawer(false);
};

window.filterMatchStatus = function(status) {
  currentMatchStatus = status;

  const pillClassMap = {
    'All': 'pill-all',
    'upcoming': 'pill-upcoming',
    'live': 'pill-live',
    'completed': 'pill-completed',
    'cancelled': 'pill-cancelled'
  };

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.remove('pill-active');
  });

  const activePillClass = pillClassMap[status];
  if (activePillClass) {
    const activePill = document.querySelector(`.filter-pill.${activePillClass}`);
    if (activePill) activePill.classList.add('pill-active');
  }

  renderMatches();
};

export function initMatchesSync() {
  onSnapshot(collection(db, "tournaments"), (snap) => {
    allTournaments = [];
    snap.forEach(d => allTournaments.push({ id: d.id, ...d.data() }));
    
    renderMatches();
    renderMyMatches();

    if (activeDetailsTournamentId) {
      updateMatchDetailsModalContent(activeDetailsTournamentId);
    }
  });

  const searchInput = document.getElementById('match-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderMatches();
    });
  }

  startCountdownEngine();
}

// --- ANDROID PROFESSIONAL BACK NAVIGATION SYSTEM ---

function performBackAction() {
  // 1. Close Winner Split Popup (Dialog)
  const winnerSplit = document.getElementById('winner-split-popup');
  const isWinnerSplitOpen = winnerSplit && !winnerSplit.classList.contains('hidden') && winnerSplit.classList.contains('opacity-100');
  if (isWinnerSplitOpen) {
    window.closeWinnerSplitPopup();
    return true;
  }

  // 2. Close Join Modal (Dialog / Bottom Sheet)
  const joinModal = document.getElementById('join-modal');
  const isJoinModalOpen = joinModal && !joinModal.classList.contains('opacity-0') && !joinModal.classList.contains('pointer-events-none');
  if (isJoinModalOpen) {
    window.closeJoinModal();
    return true;
  }

  // 3. Close Room Details Modal
  const roomModal = document.getElementById('room-details-modal');
  const isRoomModalOpen = roomModal && !roomModal.classList.contains('opacity-0') && !roomModal.classList.contains('pointer-events-none');
  if (isRoomModalOpen) {
    window.closeRoomModal();
    return true;
  }

  // 4. Close Match Details Modal
  const matchModal = document.getElementById('match-details-modal');
  const isMatchModalOpen = matchModal && !matchModal.classList.contains('opacity-0') && !matchModal.classList.contains('pointer-events-none');
  if (isMatchModalOpen) {
    window.closeMatchDetailsModal();
    return true;
  }

  // 5. Close Sidebar (Drawer)
  const drawer = document.getElementById('drawer');
  const isDrawerOpen = drawer && !drawer.classList.contains('-translate-x-full');
  if (isDrawerOpen) {
    window.toggleDrawer(false);
    return true;
  }

  // 6. Navigate to previous in-app screen
  if (window._viewHistory && window._viewHistory.length > 1) {
    window._viewHistory.pop(); // Remove active top view
    const prevView = window._viewHistory[window._viewHistory.length - 1];
    window._isBackNavigation = true;
    window.switchView(prevView);
    window._isBackNavigation = false;
    return true;
  }

  return false;
}

let lastBackPressTime = 0;

window.addEventListener('popstate', (event) => {
  // If the user has explicitly logged out or session is inactive, do not trap back key
  if (!window.currentUserDoc) {
    return;
  }

  const actionExecuted = performBackAction();
  if (actionExecuted) {
    // Restore the history dummy state to capture the next popstate event safely
    window.history.pushState({ app: "arena" }, "");
  } else {
    // Currently on Home (Arena) and no modal/sidebar is open
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      // Second tap within 2 seconds -> Exit app cleanly
      if (navigator.app && navigator.app.exitApp) {
        navigator.app.exitApp();
      } else {
        // Fallback default exit via closing the window context
        window.close();
      }
    } else {
      // First tap -> Show notification toast
      lastBackPressTime = now;
      if (window.showToast) {
        window.showToast("Press back again to exit", "info");
      }
      // Re-push history so the next popstate is captured cleanly
      window.history.pushState({ app: "arena" }, "");
    }
  }
});
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot 
} from './firebase.js';

import { 
  allTournaments, 
  renderMatches,
  formatFriendlyDate,
  format12HourTime
} from './matches.js';

// Shared live-binding operational variables
export let myParticipations = [];

// Local module operational state
let currentMyMatchTab = 'upcoming';

const DEFAULT_BANNER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop";

/**
 * Filter handler that toggles selected tab on Joined Battles view.
 * @param {string} status - Dynamic tab selector ('upcoming', 'live', 'completed', 'cancelled')
 */
window.filterMyMatchesTab = function(status) {
  currentMyMatchTab = status;
  
  const buttons = document.querySelectorAll('.mytourn-btn');
  buttons.forEach(btn => {
    if (btn.innerText.toLowerCase().includes(status.toLowerCase())) {
      btn.className = "mytourn-btn px-6 py-2.5 rounded-xl bg-gold/10 border border-gold text-white whitespace-nowrap";
    } else {
      btn.className = "mytourn-btn px-6 py-2.5 rounded-xl border border-gold/15 text-slate-400 hover:bg-gold/5 whitespace-nowrap";
    }
  });

  renderMyMatches();
};

/**
 * Renders list of registered tournaments matched by active category constraints using the premium Battles card UI.
 */
export function renderMyMatches() {
  const feed = document.getElementById('mytournaments-feed');
  if (!feed) return;
  
  feed.innerHTML = '';

  // Filter based on active selection matching tournaments status
  const filtered = myParticipations.filter(p => {
    const t = allTournaments.find(tourn => tourn.id === p.tournamentId);
    const stat = t ? (t.status || 'upcoming').toLowerCase() : 'upcoming';
    return stat === currentMyMatchTab;
  });

  // Premium empty state design configurations
  if (filtered.length === 0) {
    const emptyMessages = {
      upcoming: "No Upcoming Matches",
      live: "No Live Matches",
      completed: "No Completed Matches",
      cancelled: "No Cancelled Matches"
    };
    const emptyMessage = emptyMessages[currentMyMatchTab] || "No Registered Matches";

    feed.innerHTML = `
      <div class="col-span-1 md:col-span-2 flex flex-col items-center justify-center gap-3 p-12 bg-[#0c071a]/40 border border-[#8b5cf6]/15 rounded-[24px] w-full text-center">
        <i class="fa-solid fa-shield-slash text-purple-400 text-3xl opacity-60"></i>
        <span class="text-sm font-semibold text-slate-400 uppercase font-grotesk tracking-widest">${emptyMessage}</span>
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const t = allTournaments.find(tourn => tourn.id === p.tournamentId);
    if (!t) return;

    const max = Number(t.maxPlayers) || 100;
    const joined = Number(t.joinedCount) || 0;
    const remaining = Math.max(0, max - joined);
    const progress = Math.min(100, Math.round((joined / max) * 100));
    const status = (t.status || 'upcoming').toLowerCase();
    const mode = (t.matchType || t.mode || 'Solo');
    const mapName = (t.map || 'ERANGEL');
    const winnerPrize = t.winnerPrize || 0;

    const isJoined = true; // Always true for the user's history page
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

    const showId = (t.roomIdPublished === true || String(t.roomIdPublished) === 'true') && t.roomId;
    const showPw = (t.roomPasswordPublished === true || String(t.roomPasswordPublished) === 'true') && (t.roomPass || t.roomPassword);

    const rosterBadgeCls = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    const rosterBadgeText = "● JOINED";

    const joinBtnText = "✅ JOINED";
    const joinBtnStyle = "bg-gradient-to-r from-green-400 via-emerald-400 to-emerald-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)] opacity-90 cursor-not-allowed";
    const joinBtnDisabled = "disabled";

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
      <div class="p-3.5 space-y-2.5 bg-[#05020c]/95 border-t border-[#8b5cf6]/10 flex flex-col justify-between flex-1">

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
            <!-- Dynamic Countdown Container specific to the History view -->
            <div class="flex items-center gap-1.5 mt-1 font-mono text-center" id="full-countdown-history-${t.id}">
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
          
          <!-- Starts At alignment row -->
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

        <!-- Compact Room Credentials Layout -->
        <div class="bg-[#120924]/60 border border-gold/15 rounded-xl px-2.5 py-1 flex items-center justify-between min-h-[32px] font-grotesk">
          <span class="text-gold font-bold tracking-wider text-[8.5px] uppercase">ROOM DETAILS:</span>
          <div class="flex items-center gap-1.5 text-[11px]">
            <span class="flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20 text-[9px] font-mono">
              ID: <strong class="text-white">${showId ? t.roomId : "HIDDEN 🔒"}</strong>
              ${showId ? `<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue('${t.roomId}', 'Room ID')"></i>` : ''}
            </span>
            <span class="text-purple-500/30">|</span>
            <span class="flex items-center gap-1 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-500/20 text-[9px] font-mono">
              PW: <strong class="text-white">${showPw ? (t.roomPass || t.roomPassword || "No Password") : "HIDDEN 🔒"}</strong>
              ${showPw ? `<i class="fa-regular fa-copy cursor-pointer text-gold hover:text-white transition-colors ml-0.5" onclick="event.stopPropagation(); window.copyValue('${t.roomPass || t.roomPassword || ''}', 'Password')"></i>` : ''}
            </span>
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

/**
 * Initializes listeners for active participant registrations for the logged-in user.
 * @param {string} uid - User Identifier
 */
export function initMyMatchesSync(uid) {
  const participantsQuery = query(collection(db, "matchParticipants"), where("userId", "==", uid));
  
  onSnapshot(participantsQuery, (snap) => {
    myParticipations = [];
    snap.forEach(d => myParticipations.push({ docId: d.id, ...d.data() }));
    
    // Core redraw triggers on state mutation
    renderMatches();
    renderMyMatches();
  });
}
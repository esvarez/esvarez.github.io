(function () {
  "use strict";

  var DATA_URL = "https://d9c4rm7j1k.execute-api.us-east-1.amazonaws.com/prod/data";
  var INTEREST_URL = "https://d9c4rm7j1k.execute-api.us-east-1.amazonaws.com/prod/interest";
  var ATTENDANCE_URL = "https://d9c4rm7j1k.execute-api.us-east-1.amazonaws.com/prod/attendance";
  var DAY_ORDER = ["thursday", "friday", "saturday"];

  var state = {
    players: [],
    games: [],
    days: [],
    pendingInterest: {},
    pendingAttendance: {},
    activeDayId: null,
    search: "",
    filter: "all",
    sortField: "name",
    sortDir: "asc",
    playerSearch: "",
    playerSearchOpen: false,
    playerSearchActiveIndex: -1
  };

  var els = {
    searchInput: document.getElementById("searchInput"),
    chips: Array.prototype.slice.call(document.querySelectorAll(".chip")),
    countAll: document.getElementById("countAll"),
    countOver: document.getElementById("countOver"),
    countWithin: document.getElementById("countWithin"),
    showingCount: document.getElementById("showingCount"),
    sortField: document.getElementById("sortField"),
    sortDirBtn: document.getElementById("sortDirBtn"),
    tableHeadRow: document.getElementById("tableHeadRow"),
    desktopBody: document.getElementById("desktopTableBody"),
    mobileList: document.getElementById("mobileList"),
    emptyState: document.getElementById("emptyState"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    tableWrap: document.querySelector(".table-wrap"),
    dayTabs: document.getElementById("dayTabs"),
    dayPlaceName: document.getElementById("dayPlaceName"),
    playerSearch: document.getElementById("playerSearch"),
    playerSearchInput: document.getElementById("playerSearchInput"),
    playerSearchResults: document.getElementById("playerSearchResults"),
    dayAttendeeChips: document.getElementById("dayAttendeeChips"),
    dayAttendeeEmpty: document.getElementById("dayAttendeeEmpty"),
    dayMatchesList: document.getElementById("dayMatchesList"),
    dayEmptyHint: document.getElementById("dayEmptyHint"),
    tabGames: document.getElementById("tabGames"),
    tabAttendance: document.getElementById("tabAttendance"),
    panelGames: document.getElementById("panelGames"),
    panelAttendance: document.getElementById("panelAttendance")
  };

  function effectiveInterest(game, playerId) {
    return !!(game.interest && game.interest[playerId]);
  }

  function toggleInterest(gameId, playerId) {
    var game = state.games.find(function (g) { return g.id === gameId; });
    if (!game) return;
    var key = gameId + ":" + playerId;
    if (state.pendingInterest[key]) return;
    if (!game.interest) game.interest = {};
    var next = !effectiveInterest(game, playerId);
    game.interest[playerId] = next;
    state.pendingInterest[key] = true;
    render();

    fetch(INTEREST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: gameId,
        playerId: playerId,
        interested: next
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo guardar el interés");
      })
      .catch(function (err) {
        game.interest[playerId] = !next;
        render();
        console.error(err);
      })
      .then(function () {
        delete state.pendingInterest[key];
      });
  }

  function effectiveAttendee(day, playerId) {
    return !!(day.attendees && day.attendees.indexOf(playerId) !== -1);
  }

  function setAttendee(dayId, playerId, attending) {
    var day = state.days.find(function (d) { return d.id === dayId; });
    if (!day) return;
    var key = dayId + ":" + playerId;
    if (state.pendingAttendance[key]) return;
    if (effectiveAttendee(day, playerId) === attending) return;
    if (!day.attendees) day.attendees = [];
    if (attending) {
      day.attendees.push(playerId);
    } else {
      day.attendees = day.attendees.filter(function (id) { return id !== playerId; });
    }
    state.pendingAttendance[key] = true;
    render();

    fetch(ATTENDANCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: dayId,
        playerId: playerId,
        attending: attending
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo guardar la asistencia");
      })
      .catch(function (err) {
        if (attending) {
          day.attendees = day.attendees.filter(function (id) { return id !== playerId; });
        } else if (day.attendees.indexOf(playerId) === -1) {
          day.attendees.push(playerId);
        }
        render();
        console.error(err);
      })
      .then(function () {
        delete state.pendingAttendance[key];
      });
  }

  function sortDays(days) {
    return days.slice().sort(function (a, b) {
      var ai = DAY_ORDER.indexOf(a.id);
      var bi = DAY_ORDER.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.id.localeCompare(b.id);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  function attendeesForDay(day) {
    return state.players.filter(function (player) {
      return effectiveAttendee(day, player.id);
    });
  }

  function availablePlayers(day) {
    var q = normalize(state.playerSearch.trim());
    return state.players.filter(function (player) {
      if (effectiveAttendee(day, player.id)) return false;
      return q === "" || normalize(player.name).indexOf(q) !== -1;
    });
  }

  function closePlayerSearch() {
    state.playerSearchOpen = false;
    state.playerSearchActiveIndex = -1;
    renderPlayerSearchResults();
  }

  function addAttendee(playerId) {
    if (!state.activeDayId) return;
    setAttendee(state.activeDayId, playerId, true);
    state.playerSearch = "";
    els.playerSearchInput.value = "";
    state.playerSearchActiveIndex = 0;
    state.playerSearchOpen = true;
    renderPlayerSearchResults();
    els.playerSearchInput.focus();
  }

  function matchesForDay(day) {
    var attendeeIds = state.players
      .map(function (p) { return p.id; })
      .filter(function (pid) { return effectiveAttendee(day, pid); });
    if (attendeeIds.length === 0) return { attendeeIds: attendeeIds, rows: [] };
    var rows = state.games
      .map(computeRow)
      .filter(function (row) {
        return attendeeIds.every(function (pid) { return effectiveInterest(row.game, pid); });
      })
      .sort(function (a, b) { return a.game.name.localeCompare(b.game.name, "es"); });
    return { attendeeIds: attendeeIds, rows: rows };
  }

  function computeRow(game) {
    var interestedIds = state.players
      .map(function (p) { return p.id; })
      .filter(function (pid) { return effectiveInterest(game, pid); });
    var count = interestedIds.length;
    var over = count > game.max;
    return {
      game: game,
      interestedIds: interestedIds,
      count: count,
      over: over,
      overBy: over ? count - game.max : 0
    };
  }

  function normalize(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function getSearchMatched() {
    var q = normalize(state.search.trim());
    return state.games
      .map(computeRow)
      .filter(function (row) {
        return q === "" || normalize(row.game.name).indexOf(q) !== -1;
      });
  }

  function applyFilter(rows) {
    if (state.filter === "over") return rows.filter(function (r) { return r.over; });
    if (state.filter === "within") return rows.filter(function (r) { return !r.over; });
    return rows;
  }

  function applySort(rows) {
    var field = state.sortField;
    var dir = state.sortDir === "desc" ? -1 : 1;
    var sorted = rows.slice().sort(function (a, b) {
      var av, bv;
      if (field === "name") {
        av = a.game.name;
        bv = b.game.name;
        return av.localeCompare(bv, "es") * dir;
      }
      if (field === "limit") {
        av = a.game.max;
        bv = b.game.max;
      } else {
        av = a.count;
        bv = b.count;
      }
      if (av === bv) return a.game.name.localeCompare(b.game.name, "es");
      return (av - bv) * dir;
    });
    return sorted;
  }

  function warningIconSvg() {
    return '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 3.5L22 20.5H2L12 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M12 10v4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="17.4" r="1.15" fill="currentColor"/>' +
      "</svg>";
  }

  function toggleIconSvg() {
    return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle class="ring" cx="12" cy="12" r="9" stroke-width="1.8" fill="none"/>' +
      '<g class="check">' +
      '<circle cx="12" cy="12" r="9.5" fill="var(--accent-color)"/>' +
      '<path d="M8 12.3l2.6 2.6L16.2 9" stroke="#FFFDF8" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</g></svg>";
  }

  function countBadgeHtml(row) {
    var html = '<span class="count-row">' +
      '<span class="count-fraction">' + row.count + " / " + row.game.max + "</span>";
    if (row.over) {
      html += '<span class="over-badge">' + warningIconSvg() + " Supera por " + row.overBy + "</span>";
    }
    html += "</span>";
    return html;
  }

  function renderDesktopRow(row) {
    var tr = document.createElement("tr");
    tr.className = row.over ? "over-limit" : "";

    var nameTd = document.createElement("td");
    nameTd.className = "game-name-cell";
    nameTd.innerHTML = '<span class="game-name">' + escapeHtml(row.game.name) + "</span>";
    tr.appendChild(nameTd);

    var rangeTd = document.createElement("td");
    rangeTd.innerHTML = '<span class="range-pill">' + row.game.min + "–" + row.game.max + " jugadores</span>";
    tr.appendChild(rangeTd);

    state.players.forEach(function (player) {
      var td = document.createElement("td");
      td.className = "player-cell";
      var pressed = effectiveInterest(row.game, player.id);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toggle-btn";
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        player.name + " interesado/a en " + row.game.name
      );
      btn.innerHTML = toggleIconSvg();
      btn.addEventListener("click", function () {
        toggleInterest(row.game.id, player.id);
      });
      td.appendChild(btn);
      tr.appendChild(td);
    });

    var countTd = document.createElement("td");
    countTd.className = "interested-cell";
    countTd.innerHTML = countBadgeHtml(row);
    tr.appendChild(countTd);

    return tr;
  }

  function renderMobileCard(row) {
    var li = document.createElement("li");
    li.className = "game-card" + (row.over ? " over-limit" : "");

    var top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML =
      '<div class="card-title-group">' +
        '<p class="card-title">' + escapeHtml(row.game.name) + "</p>" +
        '<p class="card-range">' + row.game.min + "–" + row.game.max + " jugadores</p>" +
      "</div>" +
      '<div class="card-count">' + countBadgeHtml(row) + "</div>";
    li.appendChild(top);

    var chips = document.createElement("div");
    chips.className = "chip-players";
    state.players.forEach(function (player) {
      var pressed = effectiveInterest(row.game, player.id);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-chip";
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        player.name + " interesado/a en " + row.game.name
      );
      btn.innerHTML =
        '<span class="avatar" aria-hidden="true">' + player.initial + "</span>" +
        "<span>" + player.name + "</span>";
      btn.addEventListener("click", function () {
        toggleInterest(row.game.id, player.id);
      });
      chips.appendChild(btn);
    });
    li.appendChild(chips);

    return li;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function updateSortIndicators() {
    Array.prototype.forEach.call(document.querySelectorAll(".sort-arrow"), function (span) {
      var field = span.getAttribute("data-arrow");
      if (field === state.sortField) {
        span.setAttribute("data-active", state.sortDir);
      } else {
        span.removeAttribute("data-active");
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".sort-th"), function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-sort") === state.sortField ? "true" : "false");
    });
    els.sortField.value = state.sortField;
    els.sortDirBtn.setAttribute("data-dir", state.sortDir);
    els.sortDirBtn.setAttribute(
      "aria-label",
      state.sortDir === "asc" ? "Orden ascendente, cambiar a descendente" : "Orden descendente, cambiar a ascendente"
    );
    els.sortDirBtn.querySelector(".dir-label").textContent = state.sortDir === "asc" ? "Asc." : "Desc.";
  }

  function render() {
    var searchMatched = getSearchMatched();
    els.countAll.textContent = String(searchMatched.length);
    els.countOver.textContent = String(searchMatched.filter(function (r) { return r.over; }).length);
    els.countWithin.textContent = String(searchMatched.filter(function (r) { return !r.over; }).length);

    var visible = applySort(applyFilter(searchMatched));

    els.showingCount.textContent = "Mostrando " + visible.length + " de " + state.games.length;

    els.desktopBody.innerHTML = "";
    els.mobileList.innerHTML = "";

    if (visible.length === 0) {
      els.emptyState.hidden = false;
    } else {
      els.emptyState.hidden = true;
      visible.forEach(function (row) {
        els.desktopBody.appendChild(renderDesktopRow(row));
        els.mobileList.appendChild(renderMobileCard(row));
      });
    }

    els.chips.forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip.getAttribute("data-filter") === state.filter ? "true" : "false");
    });

    updateSortIndicators();
    renderDayPanel();
  }

  function buildPlayerHeaders() {
    var countTh = els.tableHeadRow.querySelector('[data-sort="interested"]').closest("th");
    state.players.forEach(function (player) {
      var th = document.createElement("th");
      th.scope = "col";
      th.className = "player-head-col";
      th.innerHTML =
        '<span class="player-head-inner">' +
          '<span class="avatar" aria-hidden="true">' + player.initial + "</span>" +
          '<span class="player-head-name">' + player.name + "</span>" +
        "</span>";
      els.tableHeadRow.insertBefore(th, countTh);
    });
    var placeholderTh = els.tableHeadRow.querySelector(".players-head-cell");
    if (placeholderTh) placeholderTh.remove();
  }

  function buildDayTabs() {
    state.days.forEach(function (day) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-tab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", day.id === state.activeDayId ? "true" : "false");
      btn.textContent = day.name;
      btn.addEventListener("click", function () {
        state.activeDayId = day.id;
        state.playerSearch = "";
        els.playerSearchInput.value = "";
        state.playerSearchOpen = false;
        state.playerSearchActiveIndex = -1;
        render();
      });
      els.dayTabs.appendChild(btn);
    });
  }

  function renderPlayerSearchResults() {
    var list = els.playerSearchResults;
    var input = els.playerSearchInput;
    if (!list || !input) return;

    var activeDay = state.days.find(function (d) { return d.id === state.activeDayId; });
    var open = state.playerSearchOpen && !!activeDay;
    input.setAttribute("aria-expanded", open ? "true" : "false");
    list.hidden = !open;
    list.innerHTML = "";
    if (!open) return;

    var options = availablePlayers(activeDay);
    if (options.length === 0) {
      var empty = document.createElement("li");
      empty.setAttribute("role", "presentation");
      var msg = document.createElement("p");
      msg.className = "player-search-empty";
      msg.textContent = state.playerSearch.trim()
        ? "No encontramos a nadie con ese nombre."
        : "Todos los jugadores ya están confirmados.";
      empty.appendChild(msg);
      list.appendChild(empty);
      return;
    }

    if (state.playerSearchActiveIndex >= options.length) {
      state.playerSearchActiveIndex = options.length - 1;
    }

    options.forEach(function (player, i) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "player-option-" + player.id;
      var selected = i === state.playerSearchActiveIndex;
      li.setAttribute("aria-selected", selected ? "true" : "false");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-search-option";
      if (selected) btn.setAttribute("aria-selected", "true");
      btn.innerHTML =
        '<span class="avatar" aria-hidden="true">' + player.initial + "</span>" +
        "<span>" + player.name + "</span>";
      btn.addEventListener("mousedown", function (e) {
        e.preventDefault();
      });
      btn.addEventListener("click", function () {
        addAttendee(player.id);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });

    var active = options[state.playerSearchActiveIndex];
    input.setAttribute(
      "aria-activedescendant",
      active ? "player-option-" + active.id : ""
    );
  }

  function renderDayPanel() {
    if (state.days.length === 0) return;
    var activeDay = state.days.find(function (d) { return d.id === state.activeDayId; });
    if (!activeDay) return;

    Array.prototype.forEach.call(els.dayTabs.children, function (btn, i) {
      btn.setAttribute("aria-selected", state.days[i].id === state.activeDayId ? "true" : "false");
    });

    els.dayPlaceName.textContent = activeDay.place || "Lugar por confirmar";

    var attendees = attendeesForDay(activeDay);
    els.dayAttendeeChips.innerHTML = "";
    attendees.forEach(function (player) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-chip attendee-chip";
      btn.setAttribute(
        "aria-label",
        "Quitar a " + player.name + " de " + activeDay.name
      );
      btn.innerHTML =
        '<span class="avatar" aria-hidden="true">' + player.initial + "</span>" +
        "<span>" + player.name + "</span>" +
        '<span class="attendee-remove" aria-hidden="true">×</span>';
      btn.addEventListener("click", function () {
        setAttendee(activeDay.id, player.id, false);
      });
      els.dayAttendeeChips.appendChild(btn);
    });
    els.dayAttendeeEmpty.hidden = attendees.length > 0;

    renderPlayerSearchResults();

    var match = matchesForDay(activeDay);
    els.dayMatchesList.innerHTML = "";

    if (match.attendeeIds.length === 0) {
      els.dayMatchesList.hidden = true;
      els.dayEmptyHint.hidden = false;
      els.dayEmptyHint.textContent = "Añade jugadores a " + activeDay.name + " para ver qué juegos coinciden.";
      return;
    }

    if (match.rows.length === 0) {
      els.dayMatchesList.hidden = true;
      els.dayEmptyHint.hidden = false;
      els.dayEmptyHint.textContent = "Ningún juego interesa a todos los asistentes de " + activeDay.name + " todavía.";
      return;
    }

    els.dayMatchesList.hidden = false;
    els.dayEmptyHint.hidden = true;
    match.rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "match-item" + (row.over ? " over-limit" : "");
      li.innerHTML =
        '<span class="match-name">' + escapeHtml(row.game.name) + "</span>" +
        '<span class="match-range">' + row.game.min + "–" + row.game.max + " jugadores</span>" +
        countBadgeHtml(row);
      els.dayMatchesList.appendChild(li);
    });
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", function (e) {
      state.search = e.target.value;
      render();
    });

    els.chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.filter = chip.getAttribute("data-filter");
        render();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll(".sort-th"), function (btn) {
      btn.addEventListener("click", function () {
        var field = btn.getAttribute("data-sort");
        if (state.sortField === field) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortField = field;
          state.sortDir = "asc";
        }
        render();
      });
    });

    els.sortField.addEventListener("change", function (e) {
      state.sortField = e.target.value;
      render();
    });

    els.sortDirBtn.addEventListener("click", function () {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      render();
    });

    els.clearFiltersBtn.addEventListener("click", function () {
      state.search = "";
      state.filter = "all";
      els.searchInput.value = "";
      render();
    });

    els.playerSearchInput.addEventListener("input", function (e) {
      state.playerSearch = e.target.value;
      state.playerSearchOpen = true;
      state.playerSearchActiveIndex = 0;
      renderPlayerSearchResults();
    });

    els.playerSearchInput.addEventListener("focus", function () {
      state.playerSearchOpen = true;
      if (state.playerSearchActiveIndex < 0) state.playerSearchActiveIndex = 0;
      renderPlayerSearchResults();
    });

    els.playerSearchInput.addEventListener("keydown", function (e) {
      var activeDay = state.days.find(function (d) { return d.id === state.activeDayId; });
      if (!activeDay) return;
      var options = availablePlayers(activeDay);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.playerSearchOpen = true;
        state.playerSearchActiveIndex = Math.min(
          state.playerSearchActiveIndex + 1,
          Math.max(options.length - 1, 0)
        );
        renderPlayerSearchResults();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        state.playerSearchActiveIndex = Math.max(state.playerSearchActiveIndex - 1, 0);
        renderPlayerSearchResults();
        return;
      }
      if (e.key === "Enter") {
        var pick = options[state.playerSearchActiveIndex];
        if (!pick && options.length === 1) pick = options[0];
        if (pick) {
          e.preventDefault();
          addAttendee(pick.id);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePlayerSearch();
      }
    });

    document.addEventListener("mousedown", function (e) {
      if (els.playerSearch && !els.playerSearch.contains(e.target)) {
        closePlayerSearch();
      }
    });
  }

  function setView(view) {
    var isGames = view === "games";
    els.tabGames.setAttribute("aria-selected", isGames ? "true" : "false");
    els.tabAttendance.setAttribute("aria-selected", isGames ? "false" : "true");
    els.panelGames.hidden = !isGames;
    els.panelAttendance.hidden = isGames;
  }

  function init() {
    els.tabGames.addEventListener("click", function () {
      setView("games");
    });
    els.tabAttendance.addEventListener("click", function () {
      setView("attendance");
    });

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo cargar los datos");
        return res.json();
      })
      .then(function (data) {
        state.players = data.players || [];
        state.games = data.games || [];
        state.days = sortDays(data.days || []);
        state.activeDayId = state.days.length ? state.days[0].id : null;
        buildPlayerHeaders();
        buildDayTabs();
        bindEvents();
        render();
      })
      .catch(function (err) {
        els.emptyState.hidden = false;
        els.emptyState.querySelector("p").textContent =
          "No se pudieron cargar los datos de los juegos.";
        console.error(err);
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

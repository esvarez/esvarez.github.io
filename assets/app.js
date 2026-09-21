(function () {
  "use strict";

  var DATA_URL = "data/games.json";
  var OVERRIDES_KEY = "bgn-overrides-v1";
  var ACCENT_KEY = "bgn-accent-v1";
  var DAY_OVERRIDES_KEY = "bgn-day-overrides-v1";

  var state = {
    players: [],
    games: [],
    days: [],
    overrides: loadOverrides(),
    dayOverrides: loadDayOverrides(),
    activeDayId: null,
    search: "",
    filter: "all",
    sortField: "name",
    sortDir: "asc"
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
    overStatNumber: document.getElementById("overStatNumber"),
    accentPicker: document.getElementById("accentPicker"),
    tableWrap: document.querySelector(".table-wrap"),
    dayTabs: document.getElementById("dayTabs"),
    dayAttendeeChips: document.getElementById("dayAttendeeChips"),
    dayMatchesList: document.getElementById("dayMatchesList"),
    dayEmptyHint: document.getElementById("dayEmptyHint")
  };

  function loadOverrides() {
    try {
      var raw = localStorage.getItem(OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveOverrides() {
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides));
    } catch (e) { /* ignore quota / privacy-mode errors */ }
  }

  function loadDayOverrides() {
    try {
      var raw = localStorage.getItem(DAY_OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveDayOverrides() {
    try {
      localStorage.setItem(DAY_OVERRIDES_KEY, JSON.stringify(state.dayOverrides));
    } catch (e) { /* ignore quota / privacy-mode errors */ }
  }

  function loadAccent() {
    try {
      return localStorage.getItem(ACCENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveAccent(color) {
    try {
      localStorage.setItem(ACCENT_KEY, color);
    } catch (e) { /* ignore */ }
  }

  function applyAccent(color) {
    document.documentElement.style.setProperty("--accent-color", color);
    if (els.accentPicker) els.accentPicker.value = color;
  }

  function effectiveInterest(game, playerId) {
    var override = state.overrides[game.id];
    if (override && Object.prototype.hasOwnProperty.call(override, playerId)) {
      return override[playerId];
    }
    return !!game.interest[playerId];
  }

  function toggleInterest(gameId, playerId) {
    var game = state.games.find(function (g) { return g.id === gameId; });
    if (!game) return;
    var current = effectiveInterest(game, playerId);
    if (!state.overrides[gameId]) state.overrides[gameId] = {};
    state.overrides[gameId][playerId] = !current;
    saveOverrides();
    render();
  }

  function effectiveAttendee(day, playerId) {
    var override = state.dayOverrides[day.id];
    if (override && Object.prototype.hasOwnProperty.call(override, playerId)) {
      return override[playerId];
    }
    return day.attendees.indexOf(playerId) !== -1;
  }

  function toggleAttendee(dayId, playerId) {
    var day = state.days.find(function (d) { return d.id === dayId; });
    if (!day) return;
    var current = effectiveAttendee(day, playerId);
    if (!state.dayOverrides[dayId]) state.dayOverrides[dayId] = {};
    state.dayOverrides[dayId][playerId] = !current;
    saveDayOverrides();
    render();
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
    var allRows = state.games.map(computeRow);
    var overCount = allRows.filter(function (r) { return r.over; }).length;
    var withinCount = allRows.length - overCount;

    els.overStatNumber.textContent = String(overCount);

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
        render();
      });
      els.dayTabs.appendChild(btn);
    });
  }

  function renderDayPanel() {
    if (state.days.length === 0) return;
    var activeDay = state.days.find(function (d) { return d.id === state.activeDayId; });
    if (!activeDay) return;

    Array.prototype.forEach.call(els.dayTabs.children, function (btn, i) {
      btn.setAttribute("aria-selected", state.days[i].id === state.activeDayId ? "true" : "false");
    });

    els.dayAttendeeChips.innerHTML = "";
    state.players.forEach(function (player) {
      var pressed = effectiveAttendee(activeDay, player.id);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-chip";
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        player.name + " asiste el " + activeDay.name
      );
      btn.innerHTML =
        '<span class="avatar" aria-hidden="true">' + player.initial + "</span>" +
        "<span>" + player.name + "</span>";
      btn.addEventListener("click", function () {
        toggleAttendee(activeDay.id, player.id);
      });
      els.dayAttendeeChips.appendChild(btn);
    });

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

    els.accentPicker.addEventListener("input", function (e) {
      applyAccent(e.target.value);
      saveAccent(e.target.value);
    });
  }

  function init() {
    var savedAccent = loadAccent();
    if (savedAccent) applyAccent(savedAccent);

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("No se pudo cargar data/games.json");
        return res.json();
      })
      .then(function (data) {
        state.players = data.players;
        state.games = data.games;
        state.days = data.days || [];
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

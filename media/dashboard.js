(function () {
  const vscode = acquireVsCodeApi();

  document.getElementById("refresh").addEventListener("click", function () {
    vscode.postMessage({ type: "refresh" });
  });

  window.addEventListener("message", function (event) {
    const msg = event.data;
    if (msg && msg.type === "data") {
      render(msg.payload);
      vscode.setState(msg.payload);
    }
  });

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    }
  }

  function toggleCost(show) {
    document.querySelectorAll(".card-cost").forEach(function (el) {
      el.style.display = show ? "" : "none";
    });
  }

  // Active-window state kept for the live countdown between data messages.
  var resetState = null;

  function render(data) {
    toggleCost(data.showCost);
    text("updated", "Updated " + data.updatedAt);

    text("today-cost", data.cards.today.cost);
    text("today-tokens", data.cards.today.tokens);
    text("month-cost", data.cards.month.cost);
    text("month-tokens", data.cards.month.tokens);
    text("all-cost", data.cards.allTime.cost);
    text("all-tokens", data.cards.allTime.tokens);

    renderReset(data.resetWindow);

    renderBars("daily", data.daily, data.showCost);
    renderTable("models", data.models, data.showCost);
    renderTable("projects", data.projects, data.showCost);

    text(
      "footnote",
      data.showCost
        ? "Cost is an estimated API-equivalent, not a bill — subscription (Max/Pro) sessions are not billed per token."
        : ""
    );
  }

  function formatDur(ms) {
    var mins = Math.max(0, Math.floor(ms / 60000));
    return Math.floor(mins / 60) + ":" + String(mins % 60).padStart(2, "0");
  }

  function setFill(pct) {
    var fill = document.getElementById("reset-fill");
    if (fill) {
      fill.style.width = pct + "%";
      fill.classList.toggle("low", pct < 10);
    }
  }

  function renderReset(rw) {
    var card = document.getElementById("reset");
    if (!card) {
      return;
    }
    if (!rw) {
      card.hidden = true;
      resetState = null;
      return;
    }
    card.hidden = false;
    if (!rw.active) {
      resetState = null;
      text("reset-big", "Claude ready");
      text("reset-sub", "");
      text(
        "reset-meta",
        "No active " + rw.windowHours + "-hour window — your quota is fresh."
      );
      setFill(rw.percentLeft == null ? 100 : rw.percentLeft);
      return;
    }
    resetState = { resetTime: Date.parse(rw.resetTime), percentLeft: rw.percentLeft };
    if (rw.limit) {
      var cap = rw.limitIsAuto ? "~" + rw.limit : rw.limit;
      text("reset-meta", rw.used + " / " + cap + " tokens used (estimated)");
    } else {
      text("reset-meta", rw.used + " tokens used · set a token limit for % left");
    }
    updateResetBig();
  }

  function updateResetBig() {
    if (!resetState) {
      return;
    }
    var left = resetState.resetTime - Date.now();
    var pct = resetState.percentLeft;
    text("reset-big", "Claude " + formatDur(left) + (pct == null ? "" : " - " + pct + "%"));
    text(
      "reset-sub",
      "resets " +
        new Date(resetState.resetTime).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
    );
    setFill(pct == null ? 100 : pct);
  }

  // Tick the countdown once a second (the % only changes on new data).
  setInterval(updateResetBig, 1000);

  function renderBars(id, rows, showCost) {
    const container = document.getElementById(id);
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = '<div class="empty">No usage yet.</div>';
      return;
    }
    rows.forEach(function (r) {
      const row = document.createElement("div");
      row.className = "bar-row";

      const label = document.createElement("div");
      label.className = "bar-label";
      label.textContent = r.label;

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = r.pct + "%";
      const aria = showCost ? r.cost : r.tokens + " tokens";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", r.label + ": " + aria);
      track.appendChild(fill);

      const value = document.createElement("div");
      value.className = "bar-value";
      value.textContent = showCost ? r.cost : r.tokens;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(value);
      container.appendChild(row);
    });
  }

  function renderTable(id, rows, showCost) {
    const container = document.getElementById(id);
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = '<div class="empty">No usage yet.</div>';
      return;
    }
    rows.forEach(function (r) {
      const row = document.createElement("div");
      row.className = "trow";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = r.label;
      name.title = r.label;

      const tokens = document.createElement("div");
      tokens.className = "num";
      tokens.textContent = r.tokens;

      const cost = document.createElement("div");
      cost.className = "num";
      cost.textContent = showCost ? r.cost : "";

      row.appendChild(name);
      row.appendChild(tokens);
      row.appendChild(cost);
      container.appendChild(row);
    });
  }

  // Restore any prior state immediately (before first data message).
  const prev = vscode.getState();
  if (prev) {
    render(prev);
  }
  vscode.postMessage({ type: "ready" });
})();

/*
 * Position Manager V1
 * cTrader Web Plugin SDK integration.
 *
 * This file intentionally uses the official SDK packages through esm.sh so the
 * project can be deployed as a static GitHub Pages site without a build step.
 */

import {
  closePosition,
  executionEvent,
  getAccountInformation,
  handleConfirmEvent,
  modifyOrderProtection,
  quoteEvent,
  registerEvent,
  subscribeQuotes,
} from "https://esm.sh/@spotware-web-team/sdk";

import {
  createClientAdapter,
} from "https://esm.sh/@spotware-web-team/sdk-external-api";

import { take, tap, catchError } from "https://esm.sh/rxjs";
import { createLogger } from "https://esm.sh/@veksa/logger";

const qs = new URLSearchParams(window.location.search);
const theme = qs.get("theme") || "dark";
const placement = qs.get("placement") || "";

document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
document.getElementById("placement").textContent = placement ? `Placement: ${placement}` : "";

const $ = (id) => document.getElementById(id);

const ui = {
  dot: $("connectionDot"),
  connection: $("connectionText"),
  balance: $("balance"),
  equity: $("equity"),
  usedMargin: $("usedMargin"),
  freeMargin: $("freeMargin"),
  positions: $("positions"),
  count: $("positionCount"),
  notice: $("notice"),
};

let adapter = null;
let connected = false;
let account = null;
const positions = new Map();
const quotes = new Map();
const subscriptions = new Set();

function setConnection(state, message) {
  ui.dot.className = `status-dot ${state}`;
  ui.connection.textContent = message;
}

function showNotice(title, message, type = "warning") {
  ui.notice.classList.remove("hidden");
  ui.notice.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  if (type === "error") {
    ui.notice.style.background = "rgba(239,100,97,.08)";
    ui.notice.style.borderColor = "rgba(239,100,97,.25)";
  } else {
    ui.notice.style.background = "rgba(231,184,75,.08)";
    ui.notice.style.borderColor = "rgba(231,184,75,.25)";
  }
}

function hideNotice() {
  ui.notice.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(value, currency = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const prefix = currency ? `${currency} ` : "";
  return `${prefix}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null);
}

function unwrap(value) {
  if (!value || typeof value !== "object") return value;
  return value.position || value.execution || value.payload || value;
}

function getPositionFromEvent(event) {
  const root = unwrap(event);
  const candidate = firstDefined(
    root?.position,
    root?.order?.position,
    root?.positionData,
    root?.payload?.position,
    root
  );
  if (!candidate || typeof candidate !== "object") return null;

  const id = firstDefined(candidate.positionId, candidate.id);
  if (id === undefined || id === null) return null;

  const volume = firstDefined(candidate.volume, candidate.tradeVolume, candidate.currentVolume);
  const sideRaw = String(firstDefined(candidate.tradeSide, candidate.side, "")).toUpperCase();
  const side = sideRaw.includes("SELL") ? "SELL" : sideRaw.includes("BUY") ? "BUY" : sideRaw;

  return {
    ...candidate,
    positionId: Number(id),
    volume: Number(volume),
    side,
    symbolId: Number(firstDefined(candidate.symbolId, candidate.symbol?.symbolId, 0)),
    symbolName: firstDefined(candidate.symbolName, candidate.symbol?.name, candidate.symbol?.symbolName, "Unknown"),
    entryPrice: Number(firstDefined(candidate.entryPrice, candidate.price, candidate.openPrice)),
    stopLoss: firstDefined(candidate.stopLoss, candidate.stopLossPrice),
    takeProfit: firstDefined(candidate.takeProfit, candidate.takeProfitPrice),
    netProfit: Number(firstDefined(candidate.netProfit, candidate.profit, candidate.pnl, 0)),
  };
}

function executionType(event) {
  const root = unwrap(event);
  return String(firstDefined(root?.executionType, root?.type, root?.eventType, "")).toUpperCase();
}

function applyExecutionEvent(event) {
  const p = getPositionFromEvent(event);
  const type = executionType(event);

  if (!p) return;

  // Keep a lightweight cache. A close/cancel event removes the position only
  // when the event explicitly indicates a close/cancel/stop-out.
  if (/CLOSE|STOP_OUT|CLOSED|POSITION_CLOSED|CANCELLED/.test(type)) {
    positions.delete(p.positionId);
  } else {
    positions.set(p.positionId, p);
  }

  renderPositions();
}

function updateAccount(data) {
  account = data?.account || data?.payload || data || {};
  ui.balance.textContent = money(firstDefined(account.balance, account.balanceAmount), account.currency || "");
  ui.equity.textContent = money(firstDefined(account.equity, account.equityAmount), account.currency || "");
  ui.usedMargin.textContent = money(firstDefined(account.usedMargin, account.margin), account.currency || "");
  ui.freeMargin.textContent = money(firstDefined(account.freeMargin, account.freeMarginAmount), account.currency || "");
}

function quoteFor(symbolId) {
  return quotes.get(Number(symbolId));
}

function currentPrice(position) {
  const q = quoteFor(position.symbolId);
  if (!q) return null;
  const bid = Number(firstDefined(q.bid, q.bidPrice));
  const ask = Number(firstDefined(q.ask, q.askPrice));
  return position.side === "SELL" ? (Number.isFinite(bid) ? bid : null) : (Number.isFinite(ask) ? ask : null);
}

function renderPositions() {
  const list = [...positions.values()];
  ui.count.textContent = `${list.length} open`;

  if (!list.length) {
    ui.positions.innerHTML = `<div class="empty">No position events received yet.<br>Open a test position after the plugin connects.</div>`;
    return;
  }

  ui.positions.innerHTML = list.map((p) => {
    const pnl = Number(p.netProfit);
    const pnlClass = pnl >= 0 ? "positive" : "negative";
    const price = currentPrice(p);
    const sl = Number(p.stopLoss);
    const tp = Number(p.takeProfit);

    return `
      <article class="position-card" data-position-id="${escapeHtml(p.positionId)}">
        <div class="position-head">
          <div class="symbol-line">
            <span class="symbol">${escapeHtml(p.symbolName)}</span>
            <span class="side ${p.side === "SELL" ? "sell" : "buy"}">${escapeHtml(p.side || "POSITION")}</span>
          </div>
          <span class="pnl ${pnlClass}">${pnl >= 0 ? "+" : ""}${money(pnl, account?.currency || "")}</span>
        </div>

        <div class="details">
          <div class="detail"><span>Volume</span><strong>${number(p.volume, 0)}</strong></div>
          <div class="detail"><span>Entry</span><strong>${number(p.entryPrice, 5)}</strong></div>
          <div class="detail"><span>Current</span><strong>${price === null ? "—" : number(price, 5)}</strong></div>
          <div class="detail"><span>Stop Loss</span><strong>${Number.isFinite(sl) && sl !== 0 ? number(sl, 5) : "—"}</strong></div>
          <div class="detail"><span>Take Profit</span><strong>${Number.isFinite(tp) && tp !== 0 ? number(tp, 5) : "—"}</strong></div>
          <div class="detail"><span>Position ID</span><strong>${escapeHtml(p.positionId)}</strong></div>
        </div>

        <div class="actions">
          <button class="button secondary" data-action="be" data-id="${p.positionId}">BE</button>
          <button class="button secondary" data-action="one-r" data-id="${p.positionId}">1R</button>
          <button class="button primary" data-action="half" data-id="${p.positionId}">Close 50%</button>
          <button class="button danger" data-action="close" data-id="${p.positionId}">Close</button>
        </div>
      </article>
    `;
  }).join("");
}

function findPosition(id) {
  return positions.get(Number(id));
}

function sendProtection(position, stopLoss, takeProfit) {
  if (!connected || !adapter) return;

  modifyOrderProtection(adapter, {
    positionId: Number(position.positionId),
    stopLoss: Number.isFinite(stopLoss) ? stopLoss : undefined,
    takeProfit: Number.isFinite(takeProfit) ? takeProfit : undefined,
  }).pipe(
    take(1),
    tap((result) => console.log("modifyOrderProtection", result)),
    catchError((error) => {
      console.error("modifyOrderProtection", error);
      showNotice("Protection change failed", "cTrader rejected the SL/TP modification.", "error");
      return [];
    })
  ).subscribe();
}

function breakEven(position) {
  const entry = Number(position.entryPrice);
  if (!Number.isFinite(entry)) return;
  sendProtection(position, entry, Number(position.takeProfit));
}

function oneR(position) {
  const entry = Number(position.entryPrice);
  const sl = Number(position.stopLoss);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || sl === 0) {
    showNotice("1R unavailable", "This position does not have a usable initial Stop Loss.");
    return;
  }

  const risk = Math.abs(entry - sl);
  const target = position.side === "SELL" ? entry - risk : entry + risk;
  sendProtection(position, sl, target);
}

function closeFraction(position, fraction) {
  if (!connected || !adapter) return;
  const volume = Number(position.volume);
  if (!Number.isFinite(volume) || volume <= 0) return;

  const closeVolume = fraction >= 1 ? volume : Math.max(1, Math.floor(volume * fraction));

  closePosition(adapter, {
    positionId: Number(position.positionId),
    volume: closeVolume,
  }).pipe(
    take(1),
    tap((result) => console.log("closePosition", result)),
    catchError((error) => {
      console.error("closePosition", error);
      showNotice("Close request failed", "cTrader rejected the close request.", "error");
      return [];
    })
  ).subscribe();
}

async function refreshAccount() {
  if (!connected || !adapter) return;

  getAccountInformation(adapter, {}).pipe(
    take(1),
    tap(updateAccount),
    catchError((error) => {
      console.error("getAccountInformation", error);
      showNotice("Account data unavailable", "The plugin could not retrieve account information.", "error");
      return [];
    })
  ).subscribe();
}

function subscribePositionQuotes() {
  const ids = [...new Set([...positions.values()].map((p) => Number(p.symbolId)).filter(Number.isFinite))]
    .filter((id) => id > 0 && !subscriptions.has(id));

  if (!ids.length || !connected || !adapter) return;

  subscribeQuotes(adapter, { symbolId: ids }).pipe(
    take(1),
    tap(() => ids.forEach((id) => subscriptions.add(id))),
    catchError((error) => {
      console.error("subscribeQuotes", error);
      return [];
    })
  ).subscribe();
}

ui.positions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const position = findPosition(button.dataset.id);
  if (!position) return;

  switch (button.dataset.action) {
    case "be":
      breakEven(position);
      break;
    case "one-r":
      oneR(position);
      break;
    case "half":
      closeFraction(position, 0.5);
      break;
    case "close":
      closeFraction(position, 1);
      break;
  }
});

$("refreshButton").addEventListener("click", refreshAccount);

async function connectToCtrader() {
  try {
    setConnection("", "Connecting…");
    showNotice("Connecting to cTrader", "Establishing the official Plugin SDK handshake…", "warning");

    const logger = createLogger(true);
    adapter = createClientAdapter({ logger });

    // Official cTrader handshake:
    // 1) confirm -> 2) wait for register -> 3) confirm -> connected.
    handleConfirmEvent(adapter, {}).pipe(take(1)).subscribe({
      error: (error) => console.error("initial confirmEvent", error),
    });

    registerEvent(adapter).pipe(
      take(1),
      tap(() => {
        handleConfirmEvent(adapter, {}).pipe(take(1)).subscribe({
          error: (error) => console.error("final confirmEvent", error),
        });

        connected = true;
        setConnection("online", "Connected");
        hideNotice();

        // Start continuous streams ONLY after the handshake is complete.
        executionEvent(adapter).pipe(
          tap((event) => {
            console.log("executionEvent", event);
            applyExecutionEvent(event);
            subscribePositionQuotes();
          }),
          catchError((error) => {
            console.error("executionEvent", error);
            showNotice("Execution stream error", String(error?.message || error), "error");
            return [];
          })
        ).subscribe();

        quoteEvent(adapter).pipe(
          tap((event) => {
            const root = unwrap(event);
            const updates = root?.quotes || root?.quote || root?.payload?.quotes || root?.payload?.quote;
            const list = Array.isArray(updates) ? updates : updates ? [updates] : [root];
            for (const q of list) {
              const id = firstDefined(q?.symbolId, q?.symbol?.symbolId);
              if (id !== undefined) quotes.set(Number(id), q);
            }
            renderPositions();
          }),
          catchError((error) => {
            console.error("quoteEvent", error);
            showNotice("Quote stream error", String(error?.message || error), "error");
            return [];
          })
        ).subscribe();

        // Request account information only after the host confirms the plugin.
        refreshAccount();
        renderPositions();
      }),
      catchError((error) => {
        console.error("registerEvent", error);
        connected = false;
        setConnection("error", "Connection failed");
        showNotice(
          "cTrader SDK handshake failed",
          String(error?.message || error || "registerEvent did not complete"),
          "error"
        );
        return [];
      })
    ).subscribe();
  } catch (error) {
    console.error("SDK initialisation", error);
    connected = false;
    setConnection("error", "Connection failed");
    showNotice(
      "Plugin SDK initialisation failed",
      String(error?.message || error),
      "error"
    );
  }
}

renderPositions();
connectToCtrader();

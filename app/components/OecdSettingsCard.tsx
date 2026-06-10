"use client";

import type { OecdPenaltyDestination, OecdSettings } from "../../src/lib/betting/types";
import { getDefaultOecdThresholds } from "../../src/lib/betting/oecd";

type OecdSettingsCardProps = {
  settings: OecdSettings;
  entryFeePerPlayer: number;
  isSkinsMode: boolean;
  formatPlainAmount: (amount: number) => string;
  onChange: (value: Partial<OecdSettings>) => void;
};

export default function OecdSettingsCard({
  settings,
  entryFeePerPlayer,
  isSkinsMode,
  formatPlainAmount,
  onChange,
}: OecdSettingsCardProps) {
  const defaultThresholds = getDefaultOecdThresholds(entryFeePerPlayer);

  function applyDefaultThresholds() {
    onChange(defaultThresholds);
  }

  function updatePenaltyDestination(value: OecdPenaltyDestination) {
    onChange({ penaltyDestination: value });
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">OECD 옵션</h2>
      <p className="mt-1 text-sm text-neutral-500">
        홀 시작 전 누적 획득 상금 기준으로 OECD 단계만 자동 표시하고, 벌금은 홀 저장 시 수동 입력합니다.
      </p>

      <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
        <span className="font-medium">OECD 사용</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
      </label>

      <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">기본 단계 기준</p>
            <p className="mt-1 text-xs">
              1인 선납금 기준 60%, 100%, 140%를 만원 단위로 반올림합니다.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-800"
            onClick={applyDefaultThresholds}
            disabled={!settings.enabled}
          >
            기본값 적용
          </button>
        </div>
        <p className="mt-2 text-xs">
          현재 1인 선납 예상 {formatPlainAmount(entryFeePerPlayer)} → 기본값 {formatPlainAmount(defaultThresholds.stage1Amount)} / {formatPlainAmount(defaultThresholds.stage2Amount)} / {formatPlainAmount(defaultThresholds.stage3Amount)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold text-neutral-500">1단계</label>
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-100"
            value={settings.stage1Amount}
            onChange={(event) => onChange({ stage1Amount: Number(event.target.value || 0) })}
            min={0}
            step={10000}
            disabled={!settings.enabled}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-500">2단계</label>
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-100"
            value={settings.stage2Amount}
            onChange={(event) => onChange({ stage2Amount: Number(event.target.value || 0) })}
            min={0}
            step={10000}
            disabled={!settings.enabled}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-neutral-500">3단계</label>
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-100"
            value={settings.stage3Amount}
            onChange={(event) => onChange({ stage3Amount: Number(event.target.value || 0) })}
            min={0}
            step={10000}
            disabled={!settings.enabled}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-neutral-50 p-3">
        <p className="text-sm font-bold">탈퇴 조건</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              settings.exitRule === "untilZero"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700"
            }`}
            onClick={() => onChange({ exitRule: "untilZero" })}
            disabled={!settings.enabled}
          >
            누적 획득 상금 0원 될 때까지
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              settings.exitRule === "belowEntryAmount"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700"
            }`}
            onClick={() => onChange({ exitRule: "belowEntryAmount" })}
            disabled={!settings.enabled}
          >
            1단계 가입 기준 미만 복귀까지
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-neutral-50 p-3">
        <p className="text-sm font-bold">벌금 처리</p>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              settings.penaltyDestination === "commonPot"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700"
            }`}
            onClick={() => updatePenaltyDestination("commonPot")}
            disabled={!settings.enabled}
          >
            공통 pot으로 적립
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              settings.penaltyDestination === "winner"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700"
            }`}
            onClick={() => updatePenaltyDestination("winner")}
            disabled={!settings.enabled || !isSkinsMode}
          >
            winner가 가져감 {isSkinsMode ? "" : "(스킨스만)"}
          </button>
        </div>
        {!isSkinsMode && (
          <p className="mt-2 text-xs text-neutral-500">
            winner 지급은 스킨스에서만 적용합니다. 다른 게임에서는 공통 pot으로 처리하세요.
          </p>
        )}
      </div>
    </section>
  );
}

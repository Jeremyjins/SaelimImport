import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { Input } from "~/components/ui/input";
import { formatDate } from "~/lib/format";
import type { OrderDetail } from "~/types/order";

// ── 공통 인라인 텍스트 필드 ──────────────────────────────────

interface InlineTextFieldProps {
  label: string;
  value: string | null;
  fieldName: string;
  placeholder?: string;
  maxLength?: number;
  onSave: (field: string, value: string) => void;
  isSaving: boolean;
}

function InlineTextField({
  label,
  value,
  fieldName,
  placeholder = "미입력",
  maxLength = 50,
  onSave,
  isSaving,
}: InlineTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleStartEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  function handleSave() {
    setEditing(false);
    if (draft !== (value ?? "")) {
      onSave(fieldName, draft);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          className="h-8 text-sm"
          disabled={isSaving}
        />
      ) : (
        <button
          onClick={handleStartEdit}
          className="text-sm font-medium text-zinc-800 hover:text-blue-600 hover:underline underline-offset-2 transition-colors text-left w-full truncate"
          title="클릭하여 수정"
        >
          {value || <span className="text-zinc-400 font-normal">{placeholder}</span>}
        </button>
      )}
    </div>
  );
}

// ── 인라인 날짜 필드 ─────────────────────────────────────────

interface InlineDateFieldProps {
  label: string;
  value: string | null;
  fieldName: string;
  onSave: (field: string, value: string) => void;
  isSaving: boolean;
}

function InlineDateField({ label, value, fieldName, onSave, isSaving }: InlineDateFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  function handleStartEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  function handleSave() {
    setEditing(false);
    if (draft !== (value ?? "")) {
      onSave(fieldName, draft);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
      {editing ? (
        <Input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="h-8 text-sm"
          disabled={isSaving}
        />
      ) : (
        <button
          onClick={handleStartEdit}
          className="text-sm font-medium text-zinc-800 hover:text-blue-600 hover:underline underline-offset-2 transition-colors text-left"
          title="클릭하여 수정"
        >
          {value ? formatDate(value) : <span className="text-zinc-400 font-normal">미입력</span>}
        </button>
      )}
    </div>
  );
}

// ── 통관비 토글 ──────────────────────────────────────────────

interface CustomsFeeToggleProps {
  value: boolean | null;
  onToggle: () => void;
  isSaving: boolean;
}

function CustomsFeeToggle({ value, onToggle, isSaving }: CustomsFeeToggleProps) {
  const isReceived = value === true;

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-zinc-400 uppercase tracking-wide">통관비 수령</p>
      <button
        onClick={onToggle}
        disabled={isSaving}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          isReceived ? "bg-green-500" : "bg-zinc-200"
        } ${isSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        title={isReceived ? "수령 완료 (클릭하여 변경)" : "미수령 (클릭하여 변경)"}
        aria-checked={isReceived}
        role="switch"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isReceived ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <p className="text-xs text-zinc-500 mt-0.5">
        {isReceived ? "수령 완료" : "미수령"}
      </p>
    </div>
  );
}

// ── 전체 인라인 필드 섹션 ────────────────────────────────────

interface Props {
  order: OrderDetail;
}

export function OrderInlineFields({ order }: Props) {
  const fieldsFetcher = useFetcher();
  const feeFetcher = useFetcher();

  const isSavingFields =
    fieldsFetcher.state !== "idle" && fieldsFetcher.formData?.get("_action") === "update_fields";
  const isSavingFee =
    feeFetcher.state !== "idle" && feeFetcher.formData?.get("_action") === "toggle_customs_fee";

  function handleFieldSave(fieldName: string, value: string) {
    fieldsFetcher.submit(
      { _action: "update_fields", [fieldName]: value },
      { method: "post" }
    );
  }

  function handleFeeToggle() {
    feeFetcher.submit(
      { _action: "toggle_customs_fee" },
      { method: "post" }
    );
  }

  // 옵티미스틱 값 (fetcher 진행 중이면 formData 기준)
  const optimisticFee =
    feeFetcher.state !== "idle"
      ? !order.customs_fee_received
      : order.customs_fee_received;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
      <InlineTextField
        label="세림번호"
        value={order.saelim_no}
        fieldName="saelim_no"
        placeholder="세림번호 미입력"
        maxLength={50}
        onSave={handleFieldSave}
        isSaving={isSavingFields}
      />
      <InlineDateField
        label="어드바이스일"
        value={order.advice_date}
        fieldName="advice_date"
        onSave={handleFieldSave}
        isSaving={isSavingFields}
      />
      <InlineDateField
        label="도착일"
        value={order.arrival_date}
        fieldName="arrival_date"
        onSave={handleFieldSave}
        isSaving={isSavingFields}
      />
      <InlineDateField
        label="배송일"
        value={order.delivery_date}
        fieldName="delivery_date"
        onSave={handleFieldSave}
        isSaving={isSavingFields}
      />
      <CustomsFeeToggle
        value={optimisticFee}
        onToggle={handleFeeToggle}
        isSaving={isSavingFee}
      />
    </div>
  );
}

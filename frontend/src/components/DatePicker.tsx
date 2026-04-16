import React, { useState } from 'react';

interface Props {
  value: string; // ISO date string YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string; // ISO date string, defaults to today
  label?: string;
}

export const DatePicker: React.FC<Props> = ({ value, onChange, maxDate, label }) => {
  const today = new Date();
  const max = maxDate ? new Date(maxDate) : today;

  // Parse the current value or initialize to today
  const currentDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [displayMonth, setDisplayMonth] = useState(currentDate.getMonth()); // 0-11
  const [displayYear, setDisplayYear] = useState(currentDate.getFullYear());
  const [isOpen, setIsOpen] = useState(false);

  // Calculate days in month
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(displayYear, displayMonth, 1).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // RTL: shift Sunday to end (Sunday = 0 → 6, Monday = 1 → 0, ..., Saturday = 6 → 5)
  const firstDayRTL = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  const dayNames = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

  const handleDayClick = (day: number) => {
    const selected = new Date(displayYear, displayMonth, day);
    // Validate against maxDate
    if (selected > max) return;
    const isoString = selected.toISOString().slice(0, 10);
    onChange(isoString);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayMonth(11);
      setDisplayYear(displayYear - 1);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayMonth(0);
      setDisplayYear(displayYear + 1);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
  };

  const isDateDisabled = (day: number) => {
    const checkDate = new Date(displayYear, displayMonth, day);
    return checkDate > max;
  };

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : 'اختر التاريخ';

  return (
    <div className="date-picker-wrapper">
      {label && <label className="form-label">{label}</label>}
      <div className="date-picker-input-container">
        <button
          type="button"
          className="date-picker-input"
          onClick={() => setIsOpen(!isOpen)}
        >
          📅 {displayValue}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            className="date-picker-backdrop"
            onClick={() => setIsOpen(false)}
          />

          {/* Centered calendar modal */}
          <div className="date-picker-calendar">
            {/* Header with month/year controls */}
            <div className="date-picker-header">
              <button
                type="button"
                className="date-picker-nav-btn"
                onClick={handleNextMonth}
                aria-label="الشهر التالي"
              >
                ◀
              </button>

              <div className="date-picker-month-year">
                <select
                  className="date-picker-select"
                  value={displayMonth}
                  onChange={(e) => setDisplayMonth(Number(e.target.value))}
                >
                  {monthNames.map((m, i) => (
                    <option key={i} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="date-picker-select"
                  value={displayYear}
                  onChange={(e) => setDisplayYear(Number(e.target.value))}
                >
                  {Array.from({ length: 100 }, (_, i) => today.getFullYear() - 100 + i).map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <button
                type="button"
                className="date-picker-nav-btn"
                onClick={handlePrevMonth}
                aria-label="الشهر السابق"
              >
                ▶
              </button>
            </div>

            {/* Day names */}
            <div className="date-picker-day-names">
              {dayNames.map((day) => (
                <div key={day} className="date-picker-day-name">
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="date-picker-days">
              {/* Empty cells for days before month starts */}
              {Array.from({ length: firstDayRTL }, (_, i) => (
                <div key={`empty-${i}`} className="date-picker-day--empty" />
              ))}

              {/* Days of the month */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const isDisabled = isDateDisabled(day);
                const isSelected =
                  value ===
                  new Date(displayYear, displayMonth, day).toISOString().slice(0, 10);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`date-picker-day ${isSelected ? 'date-picker-day--selected' : ''} ${
                      isDisabled ? 'date-picker-day--disabled' : ''
                    }`}
                    onClick={() => handleDayClick(day)}
                    disabled={isDisabled}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Close button */}
            <div className="date-picker-footer">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setIsOpen(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

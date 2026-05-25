import type { BackendDirectoryUser } from "@/lib/server-users";

export type BirthdayDirectoryUser = BackendDirectoryUser & {
  birthDate: string;
};

export type UpcomingBirthday = {
  user: BirthdayDirectoryUser;
  nextBirthdayIso: string;
  daysUntil: number;
  turnsAge: number | null;
  formattedShortDate: string;
  formattedFullDate: string;
  relativeLabel: string;
};

type BirthDateParts = {
  year: number;
  month: number;
  day: number;
};

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

const fullDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function parseBirthDateParts(value: string): BirthDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { year, month, day };
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getOccurrenceParts(year: number, month: number, day: number) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return { year, month, day: 28 };
  }

  return { year, month, day };
}

function createLocalDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getTodayLocal(date = new Date()) {
  return createLocalDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function differenceInDays(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86400000);
}

function getRelativeLabel(daysUntil: number) {
  if (daysUntil === 0) {
    return "היום";
  }

  if (daysUntil === 1) {
    return "מחר";
  }

  return `בעוד ${daysUntil} ימים`;
}

function getUpcomingBirthdayEntry(
  user: BirthdayDirectoryUser,
  today = new Date(),
): UpcomingBirthday | null {
  const parts = parseBirthDateParts(user.birthDate);

  if (!parts) {
    return null;
  }

  const todayLocal = getTodayLocal(today);
  const currentYear = todayLocal.getFullYear();

  let occurrenceParts = getOccurrenceParts(currentYear, parts.month, parts.day);
  let occurrence = createLocalDate(
    occurrenceParts.year,
    occurrenceParts.month,
    occurrenceParts.day,
  );

  if (differenceInDays(occurrence, todayLocal) < 0) {
    occurrenceParts = getOccurrenceParts(currentYear + 1, parts.month, parts.day);
    occurrence = createLocalDate(
      occurrenceParts.year,
      occurrenceParts.month,
      occurrenceParts.day,
    );
  }

  const turnsAge =
    parts.year >= 1900 ? occurrenceParts.year - parts.year : null;

  return {
    user,
    nextBirthdayIso: occurrence.toISOString(),
    daysUntil: differenceInDays(occurrence, todayLocal),
    turnsAge,
    formattedShortDate: shortDateFormatter.format(occurrence),
    formattedFullDate: fullDateFormatter.format(occurrence),
    relativeLabel: getRelativeLabel(differenceInDays(occurrence, todayLocal)),
  };
}

export function getUpcomingBirthdays(
  users: BackendDirectoryUser[],
  today = new Date(),
) {
  return users
    .filter(
      (user): user is BirthdayDirectoryUser =>
        user.role === "user" &&
        user.isActive !== false &&
        typeof user.birthDate === "string" &&
        user.birthDate.length > 0,
    )
    .map((user) => getUpcomingBirthdayEntry(user, today))
    .filter((entry): entry is UpcomingBirthday => Boolean(entry))
    .sort((left, right) => {
      if (left.daysUntil !== right.daysUntil) {
        return left.daysUntil - right.daysUntil;
      }

      return (left.user.name ?? left.user.email).localeCompare(
        right.user.name ?? right.user.email,
        "he",
      );
    });
}

export function countBirthdaysWithinDays(
  birthdays: UpcomingBirthday[],
  days: number,
) {
  return birthdays.filter((birthday) => birthday.daysUntil <= days).length;
}

export function getBirthdayByUserId(
  birthdays: UpcomingBirthday[],
  userId: string,
) {
  return birthdays.find((birthday) => birthday.user.id === userId) ?? null;
}

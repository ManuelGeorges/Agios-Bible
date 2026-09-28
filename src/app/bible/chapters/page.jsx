"use client";

import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
} from "react";

import styles from "./chapters.module.css";

import {
  useSearchParams,
  useRouter,
} from "next/navigation";

import {
  Sun,
  Compass,
  Flame,
  MapPin,
  Sword,
  Shield,
  Heart,
  Crown,
  Landmark,
  History,
  Hammer,
  Star,
  Anchor,
  Music,
  Lightbulb,
  Wind,
  Eye,
  Feather,
  Sparkles,
  Ghost,
  Mountain,
  Lamp,
  Cross,
  Users,
  MessageCircle,
  Scroll,
  Book as BookIcon,
} from "lucide-react";

import { useLanguage } from "../../context/LanguageContext";

/* =========================================================
   BOOK ICONS
========================================================= */

const bookIconMap = {
  Gen: Sun,
  Exo: Compass,
  LEV: Flame,
  NUM: MapPin,
  DEU: Scroll,

  JOS: Sword,
  JDG: Shield,
  RUT: Heart,
  "1SA": Crown,
  "2SA": Crown,

  "1KI": Landmark,
  "2KI": Landmark,
  "1CH": History,
  "2CH": History,

  EZR: Hammer,
  NEH: Hammer,
  EST: Star,
  JOB: Anchor,

  PSA: Music,
  PRO: Lightbulb,
  ECC: Wind,
  SNG: Heart,

  ISA: Eye,
  JER: Feather,
  LAM: Feather,
  EZK: Sparkles,

  DAN: Ghost,
  HOS: Heart,
  JOL: Flame,
  AMO: Mountain,

  OBA: Shield,
  JON: Anchor,
  MIC: Landmark,
  NAM: Sword,

  HAB: Lamp,
  ZEP: Sun,
  HAG: Hammer,
  ZEC: Sparkles,

  MAL: Star,

  MAT: Crown,
  MRK: Cross,
  LUK: Star,
  JHN: Sparkles,

  ACT: Users,
  ROM: Scroll,

  "1CO": MessageCircle,
  "2CO": MessageCircle,

  GAL: Feather,
  EPH: Shield,
  PHP: Heart,
  COL: Anchor,

  "1TH": Wind,
  "2TH": Wind,

  "1TI": Landmark,
  "2TI": Landmark,

  TIT: Hammer,
  PHM: Feather,
  HEB: Scroll,
  JAS: Hammer,

  "1PE": Anchor,
  "2PE": Anchor,

  "1JN": Heart,
  "2JN": Heart,
  "3JN": Heart,

  JUD: Shield,
  REV: Eye,
};

/* =========================================================
   BOOK HUES
========================================================= */

const bookHues = [
  210,
  145,
  35,
  280,
  110,
  60,
  0,
  25,
  330,
  180,
  230,
  45,
];

const getBookHue = (id) => {
  if (!id) return 210;

  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash =
      id.charCodeAt(i) +
      ((hash << 5) - hash);
  }

  return bookHues[
    Math.abs(hash) % bookHues.length
  ];
};

/* =========================================================
   ARABIC NUMBERS
========================================================= */

const arabicNumbers = [
  "٠",
  "١",
  "٢",
  "٣",
  "٤",
  "٥",
  "٦",
  "٧",
  "٨",
  "٩",
];

const formatChapterNumber = (
  number,
  language
) => {
  if (language !== "ar") {
    return String(number);
  }

  return String(number)
    .split("")
    .map(
      (digit) =>
        arabicNumbers[Number(digit)] ??
        digit
    )
    .join("");
};

/* =========================================================
   CHAPTER BUTTON
========================================================= */

const ChapterButton = React.memo(
  function ChapterButton({
    chapter,
    displayNumber,
    onClick,
  }) {
    return (
      <button
        type="button"
        className={styles.chapterItem}
        onClick={() => onClick(chapter)}
        aria-label={`Chapter ${chapter}`}
      >
        {displayNumber}
      </button>
    );
  }
);

/* =========================================================
   CHAPTERS CONTENT
========================================================= */

function ChaptersContent() {
  const {
    strings,
    language,
    bookNames,
  } = useLanguage();

  const searchParams =
    useSearchParams();

  const router = useRouter();

  const bookNameParam =
    searchParams.get("book");

  const [book, setBook] =
    useState(null);

  /* =======================================================
     FIND BOOK
  ======================================================= */

  useEffect(() => {
    if (
      !bookNames ||
      bookNames.length === 0 ||
      !bookNameParam
    ) {
      return;
    }

    const decodedBookName =
      decodeURIComponent(
        bookNameParam
      );

    const foundBook =
      bookNames.find(
        (item) =>
          item.name ===
          decodedBookName
      );

    setBook(foundBook || null);
  }, [
    bookNames,
    bookNameParam,
  ]);

  /* =======================================================
     BOOK HUE
  ======================================================= */

  const bookHue = useMemo(() => {
    if (!book) return 210;

    return getBookHue(
      book.book_id || book.id
    );
  }, [book]);

  /* =======================================================
     CHAPTERS
  ======================================================= */

  const chapters = useMemo(() => {
    if (!book) return [];

    const total =
      Number(book.chapters) || 1;

    return Array.from(
      { length: total },
      (_, index) => index + 1
    );
  }, [book]);

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const handleChapterClick = (
    chapter
  ) => {
    if (!book) return;

    router.push(
      `/bible?book=${encodeURIComponent(
        book.name
      )}&chapter=${chapter}`
    );
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (!book) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>
          {strings.common.loading}
        </div>
      </main>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main
      className={styles.container}
      style={{
        "--book-hue": bookHue,
      }}
    >
      {/* ===================================================
          HEADER
      =================================================== */}

      <header className={styles.header}>
        <div className={styles.bookInfo}>
          <h1 className={styles.title}>
            {book.name}
          </h1>

          <div
            className={styles.iconWrapper}
          >
            {(() => {
              const Icon =
                bookIconMap[
                  book.book_id
                ] ||
                (book.testament === "OT"
                  ? Scroll
                  : BookIcon);

              return (
                <Icon
                  size={24}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              );
            })()}
          </div>
        </div>
      </header>

      {/* ===================================================
          SUBTITLE
      =================================================== */}

      <p className={styles.subtitle}>
        {strings.bible.chapters_subtitle}
      </p>

      {/* ===================================================
          CHAPTER GRID
      =================================================== */}

      <div
        className={styles.chaptersGrid}
      >
        {chapters.map((chapter) => (
          <ChapterButton
            key={chapter}
            chapter={chapter}
            displayNumber={formatChapterNumber(
              chapter,
              language
            )}
            onClick={
              handleChapterClick
            }
          />
        ))}
      </div>
    </main>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function ChaptersPage() {
  const { strings } =
    useLanguage();

  return (
    <Suspense
      fallback={
        <div
          className={styles.loading}
        >
          {strings.common.loading}
        </div>
      }
    >
      <ChaptersContent />
    </Suspense>
  );
}
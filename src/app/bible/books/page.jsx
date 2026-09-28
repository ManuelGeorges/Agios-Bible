"use client";

import React, {
  useState,
  useMemo,
  Suspense,
  useEffect,
} from "react";

import styles from "./books.module.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "../../context/LanguageContext";

import {
  Search,
  Scroll,
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
  Users,
  Cross,
  MessageCircle,
  BookOpen,
} from "lucide-react";

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
   ARABIC SEARCH NORMALIZATION
========================================================= */

const normalizeArabic = (text) => {
  if (!text) return "";

  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "")
    .trim()
    .toLowerCase();
};

/* =========================================================
   BOOK CARD
========================================================= */

const BookCard = React.memo(function BookCard({
  book,
  onClick,
}) {
  const Icon =
    bookIconMap[book.book_id] ||
    (book.testament === "OT" ? Scroll : BookOpen);

  return (
    <button
      type="button"
      className={styles.bookItem}
      onClick={() => onClick(book.name)}
    >
      <div className={styles.iconWrapper}>
        <Icon
          size={24}
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>

      <span className={styles.bookName}>
        {book.name}
      </span>
    </button>
  );
});

/* =========================================================
   MAIN CONTENT
========================================================= */

function BooksContent() {
  const { strings, language, bookNames } = useLanguage();

  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab =
    searchParams.get("tab") || "OT";

  const [activeTab, setActiveTab] =
    useState(initialTab);

  const [searchQuery, setSearchQuery] =
    useState("");

  /* =======================================================
     SYNC TAB WITH URL
  ======================================================= */

  useEffect(() => {
    const tab = searchParams.get("tab");

    if (tab === "OT" || tab === "NT") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  /* =======================================================
     FILTER BOOKS
  ======================================================= */

  const filteredBooks = useMemo(() => {
    const normalizedQuery =
      normalizeArabic(searchQuery);

    return bookNames.filter((book) => {
      if (book.testament !== activeTab) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return normalizeArabic(book.name).includes(
        normalizedQuery
      );
    });
  }, [
    bookNames,
    activeTab,
    searchQuery,
  ]);

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const handleBookClick = (bookName) => {
    router.push(
      `/bible/chapters?book=${encodeURIComponent(
        bookName
      )}`
    );
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
      className={styles.container}
    >
      {/* HEADER */}

      <header className={styles.header}>
        <h1 className={styles.title}>
          {strings.bible.books_title}
        </h1>
      </header>

      {/* TABS */}

      <div
        className={styles.tabs}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "OT"}
          className={`${styles.tab} ${
            activeTab === "OT"
              ? styles.activeTab
              : ""
          }`}
          onClick={() => setActiveTab("OT")}
        >
          {strings.bible.testament_ot}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "NT"}
          className={`${styles.tab} ${
            activeTab === "NT"
              ? styles.activeTab
              : ""
          }`}
          onClick={() => setActiveTab("NT")}
        >
          {strings.bible.testament_nt}
        </button>
      </div>

      {/* SEARCH */}

      <div className={styles.searchWrapper}>
        <Search
          size={18}
          strokeWidth={2}
          className={styles.searchIcon}
          aria-hidden="true"
        />

        <input
          type="search"
          className={styles.searchInput}
          placeholder={
            strings.bible.search_book
          }
          value={searchQuery}
          onChange={(event) =>
            setSearchQuery(event.target.value)
          }
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* BOOK GRID */}

      <div className={styles.grid}>
        {filteredBooks.map((book) => (
          <BookCard
            key={book.book_id}
            book={book}
            onClick={handleBookClick}
          />
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function BooksPage() {
  const { strings } = useLanguage();

  return (
    <Suspense
      fallback={
        <div className={styles.loading}>
          {strings.common.loading}
        </div>
      }
    >
      <BooksContent />
    </Suspense>
  );
}
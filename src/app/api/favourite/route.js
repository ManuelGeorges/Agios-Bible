// src/app/api/favourite/route.js
import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

// تحديد مسارات الملفات والمجلد
const favouritesDir = path.join(process.cwd(), 'db', 'favourites');
const versesFilePath = path.join(favouritesDir, 'verses.json');
const chaptersFilePath = path.join(favouritesDir, 'chapters.json');

// دالة مساعدة للتأكد من وجود المجلد والملفات
async function ensureFilesExist() {
  try {
    await fs.mkdir(favouritesDir, { recursive: true });

    // التأكد من وجود ملف verses.json
    try {
      await fs.access(versesFilePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile(versesFilePath, '[]', 'utf-8');
      } else {
        throw error;
      }
    }

    // التأكد من وجود ملف chapters.json
    try {
      await fs.access(chaptersFilePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile(chaptersFilePath, '[]', 'utf-8');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Failed to ensure files and directory exist:', error);
    throw error;
  }
}

// دالة مساعدة لقراءة الملفات
async function readFavouritesFile(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

// دالة مساعدة لكتابة الملفات
async function writeFavouritesFile(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf-8');
  } catch (error) {
    console.error(`Error writing to file ${filePath}:`, error);
    throw error;
  }
}

// دالة GET: لجلب بيانات المفضلة
export async function GET() {
  try {
    await ensureFilesExist(); // **يتم استدعاء الدالة هنا**

    const verses = await readFavouritesFile(versesFilePath);
    const chapters = await readFavouritesFile(chaptersFilePath);

    return NextResponse.json({ verses, chapters }, { status: 200 });
  } catch (error) {
    console.error('Failed to get favourites:', error);
    return NextResponse.json({ error: 'Failed to retrieve favourites' }, { status: 500 });
  }
}

// دالة POST: لإضافة آية أو إصحاح جديد للمفضلة
export async function POST(req) {
  try {
    await ensureFilesExist(); // **يتم استدعاء الدالة هنا**

    const newFavourite = await req.json();
    let filePath;
    let dataArray;

    if (newFavourite.type === 'verse') {
      filePath = versesFilePath;
      dataArray = await readFavouritesFile(filePath);
      const existingIndex = dataArray.findIndex(item => item.verseKey === newFavourite.verseKey);
      if (existingIndex === -1) {
        dataArray.push(newFavourite);
      } else {
        dataArray[existingIndex] = newFavourite;
      }
    } else if (newFavourite.type === 'chapter') {
      filePath = chaptersFilePath;
      dataArray = await readFavouritesFile(filePath);
      const existingIndex = dataArray.findIndex(item => item.chapterKey === newFavourite.chapterKey);
      if (existingIndex === -1) {
        dataArray.push(newFavourite);
      } else {
        dataArray[existingIndex] = newFavourite;
      }
    } else {
      return NextResponse.json({ error: 'Invalid favourite type' }, { status: 400 });
    }

    await writeFavouritesFile(filePath, dataArray);
    return NextResponse.json({ message: 'Favourite added successfully' }, { status: 201 });
  } catch (error) {
    console.error('Failed to add favourite:', error);
    return NextResponse.json({ error: 'Failed to add favourite' }, { status: 500 });
  }
}

// دالة DELETE: لحذف آية أو إصحاح من المفضلة
export async function DELETE(req) {
  try {
    await ensureFilesExist(); // **يتم استدعاء الدالة هنا**
    
    const { keyToDelete, type } = await req.json();
    let filePath;
    let dataArray;

    if (type === 'verse') {
      filePath = versesFilePath;
      dataArray = await readFavouritesFile(filePath);
      dataArray = dataArray.filter(item => item.verseKey !== keyToDelete);
    } else if (type === 'chapter') {
      filePath = chaptersFilePath;
      dataArray = await readFavouritesFile(filePath);
      dataArray = dataArray.filter(item => item.chapterKey !== keyToDelete);
    } else {
      return NextResponse.json({ error: 'Invalid favourite type' }, { status: 400 });
    }

    await writeFavouritesFile(filePath, dataArray);
    return NextResponse.json({ message: 'Favourite removed successfully' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete favourite:', error);
    return NextResponse.json({ error: 'Failed to delete favourite' }, { status: 500 });
  }
}
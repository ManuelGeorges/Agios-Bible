// src/app/api/favourite/route.js

import { promises as fs } from 'fs';
import path from 'path';

const versesFilePath = path.join(process.cwd(), 'public/data/favourites/verses.json');
const chaptersFilePath = path.join(process.cwd(), 'public/data/favourites/chapters.json');

async function getFavouritesFileContent(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    if (!fileContent.trim()) {
      return [];
    }
    return JSON.parse(fileContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '[]', 'utf-8');
      return [];
    }
    throw error;
  }
}

export async function POST(request) {
  try {
    const newFavouriteItem = await request.json();
    const isChapter = newFavouriteItem.type === 'chapter';
    const filePath = isChapter ? chaptersFilePath : versesFilePath;
    const favourites = await getFavouritesFileContent(filePath);

    let isExisting;
    if (isChapter) {
      isExisting = favourites.some(item => item.chapterKey === newFavouriteItem.chapterKey);
    } else {
      isExisting = favourites.some(item => item.verseKey === newFavouriteItem.verseKey);
    }

    if (!isExisting) {
      favourites.push(newFavouriteItem);
      await fs.writeFile(filePath, JSON.stringify(favourites, null, 2));
    }

    return new Response(JSON.stringify({ message: 'Item added to favorites successfully' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to add item:', error);
    return new Response(JSON.stringify({ error: 'Failed to add item' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export async function DELETE(request) {
  try {
    const { keyToDelete, type } = await request.json();
    
    const isChapter = type === 'chapter';
    const filePath = isChapter ? chaptersFilePath : versesFilePath;
    
    const favourites = await getFavouritesFileContent(filePath);

    let updatedFavourites;
    if (isChapter) {
      updatedFavourites = favourites.filter(item => item.chapterKey !== keyToDelete);
    } else {
      updatedFavourites = favourites.filter(item => item.verseKey !== keyToDelete);
    }

    await fs.writeFile(filePath, JSON.stringify(updatedFavourites, null, 2));

    return new Response(JSON.stringify({ message: 'Item deleted successfully' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to delete item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
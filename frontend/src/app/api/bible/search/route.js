import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const lang = searchParams.get('lang') || 'ar';
    const stemParam = searchParams.get('stem') || 'false';
    const useStemming = stemParam.toLowerCase() === 'true';

    if (!query) {
      return NextResponse.json([], { status: 200 }); // ✅ Array فاضي
    }

    const pythonBackendUrl = `http://localhost:5000/api/search?q=${encodeURIComponent(query)}&lang=${lang}&stem=${useStemming}`;

    const response = await fetch(pythonBackendUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python backend error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ Proxy Error to Python backend:', error.message);
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message}` },
      { status: 500 }
    );
  }
}

"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// استيراد ملف الـ CSS الجديد الذي تم تحسينه
import styles from './maps.module.css';
import { WebMercatorViewport } from '@deck.gl/core';
import getBidiText from 'bidi-js';

// --- الثوابت ---
const MAP_STYLE = 'https://api.maptiler.com/maps/basic-v2/style.json?key=QvkUns3IvYwEEKb9dIJ7';

const INITIAL_VIEW_STATE = {
  longitude: 35.0, // خط الطول لمنطقة الشرق الأوسط
  latitude: 31.0,  // خط العرض لمنطقة الشرق الأوسط
  zoom: 5,         // مستوى الزوم الأولي
  pitch: 60,       // زاوية ميل الكاميرا (لإظهار المنظر ثلاثي الأبعاد)
  bearing: 0,      // اتجاه الكاميرا (0 يعني الشمال لأعلى)
  transitionDuration: 'auto',
};

const FLY_TO_ZOOM = 12; // زووم أعلى للانتقال إلى نقطة محددة
const FLY_TO_PITCH = 45;
const FLY_TO_DURATION = 1500; // بالمللي ثانية

// --- دوال مساعدة ---

/**
 * تحسب الحدود الجغرافية لمجموعة من النقاط.
 * تتوقع النقاط بتنسيق [longitude, latitude].
 * @param {Array<Array<number>>} points - مصفوفة من أزواج إحداثيات [خط الطول، خط العرض].
 * @returns {Array<Array<number>>} - [[minLng, minLat], [maxLng, maxLat]]
 */
const getGeoJsonBounds = (points) => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    if (!Array.isArray(points) || points.length === 0) {
        return [[0, 0], [0, 0]];
    }

    points.forEach(point => {
        const [lng, lat] = point;
        if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
        } else {
            console.warn("تمت مصادفة نقطة غير صالحة في getGeoJsonBounds:", point);
        }
    });

    if (minLng === Infinity || maxLng === -Infinity || minLat === Infinity || maxLat === -Infinity) {
        return [[0, 0], [0, 0]];
    }

    return [[minLng, minLat], [maxLng, maxLat]];
};

export default function MapsPage() {
  const [allPlaces, setAllPlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [selectedEra, setSelectedEra] = useState("الأناجيل");
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isFlyingToSpecificPoint, setIsFlyingToSpecificPoint] = useState(false);
  const mapContainerRef = useRef(null);
  const prevSelectedEraRef = useRef("الأناجيل");

  const eras = [
    "أيام إبراهيم",
    "الخروج والغزو",
    "القضاة والمملكة الموحدة",
    "المملكة المنقسمة والسبي",
    "ما بعد السبي والعهد القديم",
    "الأناجيل",
    "الكنيسة المبكرة ورحلات الرسل"
  ];

  // جلب البيانات من ملف JSON عند تحميل المكون
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/data/places/places.json');
        if (!response.ok) {
          throw new Error(`خطأ HTTP! الحالة: ${response.status}`);
        }
        const data = await response.json();

        const cleanedData = data.map(place => {
            let normalizedCoordinates = null;

            if (place.type === 'point') {
                if (typeof place.lng === 'number' && typeof place.lat === 'number' && !isNaN(place.lng) && !isNaN(place.lat)) {
                    normalizedCoordinates = [place.lng, place.lat];
                } else {
                    console.warn(`المكان '${place.name || 'غير معروف'}' (النوع: ${place.type}) لديه إحداثيات نقطة غير صالحة وسيتم تخطيه.`);
                    return null;
                }
            } else if (place.type === 'polyline') {
                if (Array.isArray(place.coordinates) && place.coordinates.every(c =>
                    Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number' && !isNaN(c[0]) && !isNaN(c[1])
                )) {
                    normalizedCoordinates = place.coordinates;
                } else {
                    console.warn(`المكان '${place.name || 'غير معروف'}' (النوع: ${place.type}) لديه إحداثيات مسار غير صالحة وسيتم تخطيه.`);
                    return null;
                }
            } else {
                console.warn(`المكان '${place.name || 'غير معروف'}' لديه نوع غير معروف أو غير مدعوم: ${place.type}. يتم التخطي.`);
                return null;
            }

            return { ...place, coords: normalizedCoordinates };
        }).filter(Boolean);

        setAllPlaces(cleanedData);
        setFilteredPlaces(cleanedData.filter(place => place.era === selectedEra));
      } catch (error) {
        console.error("خطأ في تحميل بيانات الأماكن:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const flyToLocation = useCallback((targetLng, targetLat) => {
    if (typeof targetLng !== 'number' || typeof targetLat !== 'number' || isNaN(targetLng) || isNaN(targetLat)) {
        console.error('تم تمرير إحداثيات غير صالحة إلى flyToLocation:', targetLng, targetLat);
        return;
    }
    setIsFlyingToSpecificPoint(true);
    setViewState(prev => ({
      ...prev,
      longitude: targetLng,
      latitude: targetLat,
      zoom: FLY_TO_ZOOM,
      pitch: FLY_TO_PITCH,
      transitionDuration: FLY_TO_DURATION,
      onTransitionEnd: () => setIsFlyingToSpecificPoint(false),
    }));
  }, []);

  useEffect(() => {
    if (isFlyingToSpecificPoint) {
      return;
    }
    
    if (isLoading || allPlaces.length === 0 || !mapContainerRef.current || !mapLoaded) return;

    const newFilteredPlaces = allPlaces.filter(place => place.era === selectedEra);
    setFilteredPlaces(newFilteredPlaces);

    const mapWidth = mapContainerRef.current.offsetWidth;
    const mapHeight = mapContainerRef.current.offsetHeight;

    const eraChanged = prevSelectedEraRef.current !== selectedEra;
    const isInitialLoadAndNotFitted = !isLoading && mapLoaded &&
                                      viewState.zoom === INITIAL_VIEW_STATE.zoom &&
                                      viewState.longitude === INITIAL_VIEW_STATE.longitude &&
                                      viewState.latitude === INITIAL_VIEW_STATE.latitude;

    if ((eraChanged || isInitialLoadAndNotFitted) && newFilteredPlaces.length > 0 && mapWidth > 0 && mapHeight > 0) {
        const pointsForFitBounds = newFilteredPlaces.flatMap(place => {
            if (place.coords && place.coords.length > 0) {
                if (place.type === 'point') {
                    return [[place.coords[0], place.coords[1]]];
                } else if (place.type === 'polyline') {
                    return place.coords.map(c => [c[0], c[1]]);
                }
            }
            return [];
        }).filter(point =>
            Array.isArray(point) && point.length === 2 &&
            typeof point[0] === 'number' && typeof point[1] === 'number' &&
            !isNaN(point[0]) && !isNaN(point[1])
        );

        if (pointsForFitBounds.length > 0) {
          const bounds = getGeoJsonBounds(pointsForFitBounds);

          if (bounds[0][0] === Infinity || bounds[1][0] === -Infinity || isNaN(bounds[0][0])) {
              console.warn("الحدود المحسوبة غير صالحة، سيتم العودة إلى INITIAL_VIEW_STATE.");
              setViewState(INITIAL_VIEW_STATE);
              return;
          }

          const viewport = new WebMercatorViewport({
            width: mapWidth,
            height: mapHeight,
            ...INITIAL_VIEW_STATE,
          });

          const { longitude, latitude, zoom } = viewport.fitBounds(
            bounds,
            { padding: { top: 50, bottom: 50, left: 50, right: 50 } }
          );

          if (typeof longitude === 'number' && typeof latitude === 'number' && typeof zoom === 'number' &&
              !isNaN(longitude) && !isNaN(latitude) && !isNaN(zoom)) {
            setViewState(prev => ({
              ...prev,
              longitude,
              latitude,
              zoom: Math.min(zoom, 10),
              pitch: INITIAL_VIEW_STATE.pitch,
              bearing: INITIAL_VIEW_STATE.bearing,
              transitionDuration: 1000,
            }));
          } else {
            console.warn("قيم viewState المحسوبة غير صالحة (NaN)، سيتم العودة إلى INITIAL_VIEW_STATE.");
            setViewState(INITIAL_VIEW_STATE);
          }
        } else {
          console.log("لا توجد نقاط صالحة في الحقبة المفلترة، سيتم العودة إلى حالة العرض الأولية.");
          setViewState(INITIAL_VIEW_STATE);
        }
    } else if (newFilteredPlaces.length === 0 && (eraChanged || isInitialLoadAndNotFitted)) {
      console.log("الأماكن المفلترة فارغة، سيتم العودة إلى حالة العرض الأولية.");
      setViewState(INITIAL_VIEW_STATE);
    }

    prevSelectedEraRef.current = selectedEra;
  }, [selectedEra, allPlaces, mapContainerRef.current?.offsetWidth, mapContainerRef.current?.offsetHeight, isLoading, mapLoaded, isFlyingToSpecificPoint]);

  const onViewStateChange = useCallback(({ viewState }) => {
    if (typeof viewState.longitude === 'number' && !isNaN(viewState.longitude) &&
        typeof viewState.latitude === 'number' && !isNaN(viewState.latitude) &&
        typeof viewState.zoom === 'number' && !isNaN(viewState.zoom)) {
        setViewState(viewState);
    } else {
        console.warn("تم الكشف عن viewState غير صالح من تفاعل المستخدم، لن يتم التحديث.");
    }
  }, []);

  const layers = [
    new ScatterplotLayer({
      id: 'point-places-layer',
      data: filteredPlaces.filter(d => d.type === 'point'),
      getPosition: d => [d.coords[0], d.coords[1], 0],
      getRadius: 10,
      radiusUnits: 'pixels',
      getFillColor: [100, 255, 255, 200],
      getLineColor: [255, 255, 255, 100],
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      stroked: true,
      pickable: true,
      onClick: ({ object }) => {
        if (object) {
          console.log(`المدينة: ${object.name}\nالمعلومات: ${object.info}`);
        }
      }
    }),
    new PathLayer({
      id: 'path-places-layer',
      data: filteredPlaces.filter(d => d.type === 'polyline'),
      getPath: d => d.coords.map(coord => [coord[0], coord[1], 100]),
      getColor: [0, 200, 255, 255],
      getWidth: 7,
      widthUnits: 'pixels',
      pickable: true,
      widthMinPixels: 3,
      onClick: ({ object }) => {
        if (object) {
          console.log(`المسار: ${object.name}\nالمعلومات: ${object.info}`);
        }
      }
    }),
    new TextLayer({
      id: 'text-places-layer',
      data: filteredPlaces.filter(d => d.type === 'point'),
      getPosition: d => [d.coords[0], d.coords[1], 100],
      getText: d => getBidiText(d.name),
      getColor: [255, 255, 255, 255],
      getSize: 18,
      getAngle: 0,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      getPixelOffset: [0, -15],
      fontFamily: 'Vazirmatn, Arial, "Noto Sans Arabic", sans-serif',
      fontWeight: 'bold',
      pickable: true,
      getBackgroundColor: [0, 0, 0, 150],
      getBorderColor: [100, 255, 255, 150],
      getBorderWidth: 2,
      visible: viewState.zoom > 7
    })
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>خرائط الكتاب المقدس</h1>
      <p className={styles.description}>
        استكشف الأماكن الجغرافية المذكورة في الكتاب المقدس، مقسمة حسب الحقبات التاريخية.
      </p>

      <div className={styles.buttonsContainer}>
        {eras.map(era => (
          <button
            key={era}
            onClick={() => setSelectedEra(era)}
            className={`${styles.button} ${selectedEra === era ? styles.active : ''}`}
          >
            {era}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className={styles.loadingMessage}>
          <div className={styles.spinner}></div>
          <p>جارٍ تحميل بيانات الخريطة...</p>
        </div>
      ) : (
        <>
          <div className={styles.placeButtonsContainer}>
              {filteredPlaces.filter(p => p.type === 'point').length > 0 ? (
                  filteredPlaces.filter(p => p.type === 'point').map(place => (
                      place.lng && typeof place.lng === 'number' && !isNaN(place.lng) &&
                      place.lat && typeof place.lat === 'number' && !isNaN(place.lat)
                      ? (
                          <button
                              key={`place-${place.name}-${place.lng}`}
                              onClick={() => flyToLocation(place.lng, place.lat)}
                              className={styles.placeButton}
                          >
                              {place.name}
                          </button>
                      ) : null
                  ))
              ) : (
                  <p className={styles.noPlacesMessage}>لا توجد أماكن لعرضها في حقبة "{selectedEra}".</p>
              )}
          </div>

          <div ref={mapContainerRef} className={styles.mapContainer}>
              <DeckGL
                  initialViewState={INITIAL_VIEW_STATE}
                  viewState={viewState}
                  onViewStateChange={onViewStateChange}
                  controller={true}
                  layers={layers}
                  style={{ width: '100%', height: '100%' }}
              >
                  <Map
                      mapLib={maplibregl}
                      mapStyle={MAP_STYLE}
                      onLoad={() => setMapLoaded(true)}
                  />
              </DeckGL>
          </div>
        </>
      )}

      <p className={styles.footerText}>
        هذه الخريطة تعرض المواقع والمسارات الرئيسية في الحقبة الزمنية المختارة.
      </p>
    </div>
  );
}

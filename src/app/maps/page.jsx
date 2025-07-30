"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './maps.module.css';
import { WebMercatorViewport } from '@deck.gl/core';
import getBidiText from 'bidi-js'; // <--- هذا هو الاستيراد الصحيح الآن

// --- الثوابت ---
const MAP_STYLE = 'https://api.maptiler.com/maps/basic-v2/style.json?key=QvkUns3IvYwEEKb9dIJ7';

const INITIAL_VIEW_STATE = {
  longitude: 35.0, // خط الطول لمنطقة الشرق الأوسط
  latitude: 31.0,  // خط العرض لمنطقة الشرق الأوسط
  zoom: 5,         // مستوى الزوم الأولي
  pitch: 60,       // زاوية ميل الكاميرا (لإظهار المنظر ثلاثي الأبعاد)
  bearing: 0,      // اتجاه الكاميرا (0 يعني الشمال لأعلى)
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
        return [[0, 0], [0, 0]]; // إرجاع حدود افتراضية إذا لم تكن هناك نقاط
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

    // التحقق من الحدود المتدهورة (على سبيل المثال، جميع النقاط هي نفسها)
    if (minLng === Infinity || maxLng === -Infinity || minLat === Infinity || maxLat === -Infinity) {
        return [[0, 0], [0, 0]]; // العودة للخلف إذا لم يتم حساب الحدود بشكل صحيح
    }

    return [[minLng, minLat], [maxLng, maxLat]];
};

export default function MapsPage() {
  const [allPlaces, setAllPlaces] = useState([]); // كل الأماكن من ملف JSON
  const [filteredPlaces, setFilteredPlaces] = useState([]); // الأماكن المفلترة حسب الحقبة
  const [selectedEra, setSelectedEra] = useState("الأناجيل"); // الحقبة المختارة افتراضياً
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE); // حالة عرض الخريطة
  const [isLoading, setIsLoading] = useState(true); // حالة التحميل لجلب البيانات
  const [mapLoaded, setMapLoaded] = useState(false); // حالة لتتبع ما إذا كانت خريطة Maplibre GL JS قد تم تحميلها
  const [isFlyingToSpecificPoint, setIsFlyingToSpecificPoint] = useState(false); // <--- حالة جديدة لتتبع الانتقال لنقطة محددة
  const mapContainerRef = useRef(null); // useRef لربط الـ div بحاوية الخريطة
  const prevSelectedEraRef = useRef("الأناجيل"); // <--- useRef جديد لتتبع الحقبة السابقة

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

        // التحقق من صحة وتوحيد الإحداثيات إلى [خط الطول، خط العرض]
        const cleanedData = data.map(place => {
            let normalizedCoordinates = null;

            if (place.type === 'point') {
                // بما أن ملف JSON يستخدم حقول 'lng' و 'lat' منفصلة للنقاط
                if (typeof place.lng === 'number' && typeof place.lat === 'number' && !isNaN(place.lng) && !isNaN(place.lat)) {
                    normalizedCoordinates = [place.lng, place.lat];
                } else {
                    console.warn(`المكان '${place.name || 'غير معروف'}' (النوع: ${place.type}) لديه إحداثيات نقطة غير صالحة وسيتم تخطيه.`);
                    return null;
                }
            } else if (place.type === 'polyline') {
                // بما أن ملف JSON يستخدم مصفوفة 'coordinates' بالفعل بتنسيق [lng, lat] لكل نقطة
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

            // إذا كانت الإحداثيات صحيحة، أضفها كحقل 'coords' لتوحيد الوصول لاحقًا
            return { ...place, coords: normalizedCoordinates };
        }).filter(Boolean); // إزالة الإدخالات الفارغة (الأماكن غير الصالحة)

        setAllPlaces(cleanedData);
        // فلترة أولية بناءً على الحقبة الافتراضية
        setFilteredPlaces(cleanedData.filter(place => place.era === selectedEra));
      } catch (error) {
        console.error("خطأ في تحميل بيانات الأماكن:", error);
        // TODO: عرض رسالة خطأ للمستخدم
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []); // يعمل مرة واحدة عند تحميل المكون

  // دالة للانتقال إلى موقع محدد (تتوقع [خط الطول، خط العرض])
  const flyToLocation = useCallback((targetLng, targetLat) => {
    if (typeof targetLng !== 'number' || typeof targetLat !== 'number' || isNaN(targetLng) || isNaN(targetLat)) {
        console.error('تم تمرير إحداثيات غير صالحة إلى flyToLocation:', targetLng, targetLat);
        return;
    }
    setIsFlyingToSpecificPoint(true); // <--- تعيين العلامة إلى true قبل بدء الانتقال
    setViewState(prev => ({
      ...prev,
      longitude: targetLng,
      latitude: targetLat,
      zoom: FLY_TO_ZOOM,
      pitch: FLY_TO_PITCH,
      transitionDuration: FLY_TO_DURATION,
      onTransitionEnd: () => setIsFlyingToSpecificPoint(false), // <--- إعادة تعيين العلامة بعد انتهاء الانتقال
    }));
  }, []);

  // تأثير لفلترة الأماكن وتعديل عرض الخريطة (الزووم التلقائي للحقبة)
  useEffect(() => {
    // إذا كنا ننتقل إلى نقطة محددة، فلا تقم بتجاوز حالة العرض
    if (isFlyingToSpecificPoint) {
      return;
    }

    // لا تشغل هذا التأثير إلا بعد تحميل البيانات وتوفر أبعاد حاوية الخريطة، وبعد تحميل maplibre
    if (isLoading || allPlaces.length === 0 || !mapContainerRef.current || !mapLoaded) return;

    const newFilteredPlaces = allPlaces.filter(place => place.era === selectedEra);
    setFilteredPlaces(newFilteredPlaces); // تحديث الأماكن المفلترة

    const mapWidth = mapContainerRef.current.offsetWidth;
    const mapHeight = mapContainerRef.current.offsetHeight;

    // تحديد ما إذا كان يجب ضبط الحدود:
    // 1. إذا تغيرت الحقبة المختارة.
    // 2. إذا كان التحميل الأولي (isLoading false، ولكن الخريطة لم يتم ضبطها بعد، أي الزووم لا يزال في حالته الأولية).
    // 3. إذا كانت هناك أماكن لضبط الحدود لها وأبعاد الخريطة صالحة.
    const eraChanged = prevSelectedEraRef.current !== selectedEra;
    const isInitialLoadAndNotFitted = !isLoading && mapLoaded && 
                                     viewState.zoom === INITIAL_VIEW_STATE.zoom && 
                                     viewState.longitude === INITIAL_VIEW_STATE.longitude && 
                                     viewState.latitude === INITIAL_VIEW_STATE.latitude;

    if ((eraChanged || isInitialLoadAndNotFitted) && newFilteredPlaces.length > 0 && mapWidth > 0 && mapHeight > 0) {
        // جمع كل النقاط ([خط الطول، خط العرض]) لحساب الحدود الجغرافية
        const pointsForFitBounds = newFilteredPlaces.flatMap(place => {
            if (place.coords && place.coords.length > 0) { // الآن نستخدم 'coords' الموحدة
                if (place.type === 'point') {
                    // Coordinates are already normalized to [lng, lat] and stored in 'coords'
                    return [[place.coords[0], place.coords[1]]];
                } else if (place.type === 'polyline') {
                    // Each coord in polyline is already [lng, lat] and stored in 'coords'
                    return place.coords.map(c => [c[0], c[1]]);
                }
            }
            return []; // تخطي الإدخالات غير الصالحة أو الأماكن بدون إحداثيات
        }).filter(point =>
            Array.isArray(point) && point.length === 2 &&
            typeof point[0] === 'number' && typeof point[1] === 'number' &&
            !isNaN(point[0]) && !isNaN(point[1])
        );

        if (pointsForFitBounds.length > 0) {
          const bounds = getGeoJsonBounds(pointsForFitBounds);

          // التحقق من صحة الحدود (ليست Infinity أو NaN)
          if (bounds[0][0] === Infinity || bounds[1][0] === -Infinity || isNaN(bounds[0][0])) {
              console.warn("الحدود المحسوبة غير صالحة، سيتم العودة إلى INITIAL_VIEW_STATE.");
              setViewState(INITIAL_VIEW_STATE);
              return;
          }

          const viewport = new WebMercatorViewport({
            width: mapWidth,
            height: mapHeight,
            ...INITIAL_VIEW_STATE, // استخدام INITIAL_VIEW_STATE كأساس للحساب
          });

          const { longitude, latitude, zoom } = viewport.fitBounds(
            bounds,
            { padding: { top: 50, bottom: 50, left: 50, right: 50 } } // هام: إضافة حشو لمنع قص الأماكن
          );

          // التحقق من صحة القيم المحسوبة قبل تحديث viewState
          if (typeof longitude === 'number' && typeof latitude === 'number' && typeof zoom === 'number' &&
              !isNaN(longitude) && !isNaN(latitude) && !isNaN(zoom)) {
            setViewState(prev => ({
              ...prev,
              longitude,
              latitude,
              zoom: Math.min(zoom, 10), // تحديد أقصى زووم لمنع التكبير الزائد على النقاط الفردية
              pitch: INITIAL_VIEW_STATE.pitch,
              bearing: INITIAL_VIEW_STATE.bearing,
              transitionDuration: 1000, // <--- مدة الانتقال لتغيير الحقبة
            }));
          } else {
            console.warn("قيم viewState المحسوبة غير صالحة (NaN)، سيتم العودة إلى INITIAL_VIEW_STATE.");
            setViewState(INITIAL_VIEW_STATE);
          }
        } else {
          // إذا لم تكن هناك نقاط صالحة للعرض في الحقبة المفلترة، أعد إلى العرض الأولي
          console.log("لا توجد نقاط صالحة في الحقبة المفلترة، سيتم العودة إلى حالة العرض الأولية.");
          setViewState(INITIAL_VIEW_STATE);
        }
    } else if (newFilteredPlaces.length === 0 && (eraChanged || isInitialLoadAndNotFitted)) {
      // إذا كانت القائمة المفلترة فارغة وتغيرت الحقبة أو كان التحميل الأولي، أعد إلى العرض الأولي
      console.log("الأماكن المفلترة فارغة، سيتم العودة إلى حالة العرض الأولية.");
      setViewState(INITIAL_VIEW_STATE);
    }

    // تحديث المرجع للحقبة السابقة للاستخدام في العرض التالي
    prevSelectedEraRef.current = selectedEra;
  }, [selectedEra, allPlaces, mapContainerRef.current?.offsetWidth, mapContainerRef.current?.offsetHeight, isLoading, mapLoaded, isFlyingToSpecificPoint]); // <--- إضافة isFlyingToSpecificPoint كاعتمادية

  // دالة تُستدعى عندما تتغير حالة عرض الخريطة (مثلاً، تحريك المستخدم للخريطة)
  const onViewStateChange = useCallback(({ viewState }) => {
    // التحقق من أن viewState يحتوي على قيم صالحة قبل التحديث
    if (typeof viewState.longitude === 'number' && !isNaN(viewState.longitude) &&
        typeof viewState.latitude === 'number' && !isNaN(viewState.latitude) &&
        typeof viewState.zoom === 'number' && !isNaN(viewState.zoom)) {
        setViewState(viewState);
    } else {
        console.warn("تم الكشف عن viewState غير صالح من تفاعل المستخدم، لن يتم التحديث.");
    }
  }, []);

  // تعريف طبقات Deck.gl لعرض النقاط والمسارات والنصوص
  const layers = [
    // طبقة النقاط (أماكن العرض كنقاط صغيرة شفافة)
    new ScatterplotLayer({
      id: 'point-places-layer',
      data: filteredPlaces.filter(d => d.type === 'point'),
      // getPosition تتوقع [خط الطول، خط العرض، الارتفاع]
      getPosition: d => [d.coords[0], d.coords[1], 0], // الإحداثيات الآن في 'coords'
      getRadius: 5, // نصف قطر النقطة بالبكسل (صغيرة جداً)
      radiusUnits: 'pixels',
      getFillColor: [0, 128, 255, 100], // لون أزرق فاتح وشفاف
      getLineColor: [255, 255, 255, 50], // حدود بيضاء شبه شفافة
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      stroked: true,
      pickable: true,
      onClick: ({ object }) => {
        if (object) {
          console.log(`المدينة: ${object.name}\nالمعلومات: ${object.info}`);
          // يمكن إضافة PopUp أو معلومات هنا
        }
      }
    }),
    // طبقة المسارات (الرحلات) - خطوط ثلاثية الأبعاد وواضحة
    new PathLayer({
      id: 'path-places-layer',
      data: filteredPlaces.filter(d => d.type === 'polyline'),
      // getPath تتوقع مصفوفة من [خط الطول، خط العرض، الارتفاع]
      getPath: d => d.coords.map(coord => [coord[0], coord[1], 100]), // الإحداثيات الآن في 'coords'
      getColor: [0, 150, 255, 255], // لون أزرق واضح
      getWidth: 5, // سمك الخط بالبكسل
      widthUnits: 'pixels',
      pickable: true,
      widthMinPixels: 2,
      onClick: ({ object }) => {
        if (object) {
          console.log(`المسار: ${object.name}\nالمعلومات: ${object.info}`);
          // يمكن إضافة PopUp أو معلومات هنا
        }
      }
    }),
    // طبقة النص (أسماء الأماكن) - تظهر فوق النقاط
    new TextLayer({
      id: 'text-places-layer',
      data: filteredPlaces.filter(d => d.type === 'point'),
      // getPosition تتوقع [خط الطول، خط العرض، الارتفاع]
      getPosition: d => [d.coords[0], d.coords[1], 100], // الإحداثيات الآن في 'coords'
      getText: d => getBidiText(d.name), // معالجة النص العربي باستخدام getBidiText مباشرة
      getColor: [255, 255, 255, 255], // لون النص أبيض
      getSize: 16, // حجم الخط
      getAngle: 0,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      getPixelOffset: [0, -10], // إزاحة النص قليلاً للأعلى عن النقطة
      fontFamily: 'Arial, "Noto Sans Arabic", sans-serif', // استخدام خطوط تدعم العربية
      fontWeight: 'bold',
      pickable: true,
      getBackgroundColor: [0, 0, 0, 100], // خلفية خفيفة للنص
      getBorderColor: [0, 0, 0, 100],
      getBorderWidth: 1,
      // عرض النص فقط إذا كان الزوم عالياً بما يكفي لتجنب الازدحام
      visible: viewState.zoom > 7 // اضبط هذا الحد حسب الحاجة
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
        <div className={styles.loadingMessage}>جارٍ تحميل بيانات الخريطة...</div>
      ) : (
        <>
            <div className={styles.placeButtonsContainer}>
                {filteredPlaces.filter(p => p.type === 'point').length > 0 ? (
                    filteredPlaces.filter(p => p.type === 'point').map(place => (
                        // بما أننا نستخدم الآن 'lng' و 'lat' مباشرة من JSON الأصلي لنقاط النوع 'point'
                        place.lng && typeof place.lng === 'number' && !isNaN(place.lng) &&
                        place.lat && typeof place.lat === 'number' && !isNaN(place.lat)
                        ? (
                            <button
                                key={`place-${place.name}-${place.lng}`} // استخدام lng في المفتاح ليكون فريدًا
                                onClick={() => flyToLocation(place.lng, place.lat)} // تمرير [longitude, latitude] للدالة
                                className={styles.placeButton}
                            >
                                {place.name}
                            </button>
                        ) : null // لا تعرض الزر إذا كانت الإحداثيات غير صالحة
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
                        onLoad={() => setMapLoaded(true)} // تعيين mapLoaded إلى true عندما تكون خريطة Maplibre GL JS جاهزة
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
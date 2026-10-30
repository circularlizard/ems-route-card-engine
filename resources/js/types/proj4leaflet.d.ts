declare module 'proj4leaflet' {
    import * as L from 'leaflet';
    import proj4 from 'proj4';

    export class CRS implements L.CRS {
        projection: L.Projection;
        transformation: L.Transformation;
        code?: string;
        wrapLng?: [number, number];
        wrapLat?: [number, number];
        infinite: boolean;
        constructor(srsCode: string, proj4def: string | proj4.ProjectionDefinition, options?: any);
        latLngToPoint(latlng: L.LatLngExpression, zoom: number): L.Point;
        pointToLatLng(point: L.PointExpression, zoom: number): L.LatLng;
        project(latlng: L.LatLng | L.LatLngLiteral): L.Point;
        unproject(point: L.PointExpression, unbounded?: boolean): L.LatLng;
        scale(zoom: number): number;
        zoom(scale: number): number;
        getProjectedBounds(zoom: number): L.Bounds;
        distance(latlng1: L.LatLngExpression, latlng2: L.LatLngExpression): number;
    }

    const proj4leaflet: {
        CRS: typeof CRS;
        [key: string]: any;
    };
    export default proj4leaflet;
}

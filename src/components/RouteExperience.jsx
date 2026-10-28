import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyRouteMetadata } from '../lib/routeMetadata';
export default function RouteExperience(){const {pathname}=useLocation();useEffect(()=>{applyRouteMetadata(pathname);if(pathname==='/admin/live')return;document.getElementById('main-content')?.focus({preventScroll:true});},[pathname]);return null;}

export function SkipLink(){return <a className="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>Saltar al contenido</a>;}

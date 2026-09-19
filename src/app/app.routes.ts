import { Routes } from '@angular/router';
export const routes: Routes = [
 {path:'',loadComponent:()=>import('./pages/brand/brand.component').then(m=>m.BrandComponent)},
 {path:'about',redirectTo:'',pathMatch:'full'},
 {path:'programs',redirectTo:'',pathMatch:'full'},
 {path:'programs/:slug',loadComponent:()=>import('./pages/brand/brand.component').then(m=>m.BrandComponent)},
 {path:'courses',redirectTo:'',pathMatch:'full'},
 {path:'courses/:slug',loadComponent:()=>import('./pages/brand/brand.component').then(m=>m.BrandComponent)},
 {path:'media',redirectTo:'',pathMatch:'full'},
 {path:'testimonials',redirectTo:'',pathMatch:'full'},
 {path:'consultations',redirectTo:'',pathMatch:'full'},
 {path:'contact',redirectTo:'',pathMatch:'full'},
 {path:'**',redirectTo:''}
];

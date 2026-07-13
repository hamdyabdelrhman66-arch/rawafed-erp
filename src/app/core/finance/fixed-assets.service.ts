import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class FixedAssetsService {
  constructor(private readonly api: ApiService) {}

  masterData(): Promise<any> { return this.api.get('/assets/master-data'); }
  categories(): Promise<any[]> { return this.api.get<any[]>('/assets/categories'); }
  createCategory(payload: any): Promise<any> { return this.api.post('/assets/categories', payload); }
  assets(): Promise<any[]> { return this.api.get<any[]>('/assets'); }
  asset(id: string): Promise<any> { return this.api.get(`/assets/${id}`); }
  createAsset(payload: any): Promise<any> { return this.api.post('/assets', payload); }
  depreciate(id: string, period: string): Promise<any> { return this.api.post(`/assets/${id}/depreciation`, { period }); }
  runDepreciation(period: string): Promise<any> { return this.api.post('/assets/depreciation/run', { period }); }
  transfer(id: string, payload: any): Promise<any> { return this.api.post(`/assets/${id}/transfers`, payload); }
  dispose(id: string, payload: any): Promise<any> { return this.api.post(`/assets/${id}/disposals`, payload); }
  maintain(id: string, payload: any): Promise<any> { return this.api.post(`/assets/${id}/maintenance`, payload); }
  report(type: string): Promise<any[]> { return this.api.get<any[]>(`/assets/reports/${type}`); }
}

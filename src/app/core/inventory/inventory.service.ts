import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  constructor(private readonly api: ApiService) {}

  getDashboard(): Promise<any> {
    return this.api.get<any>('/inventory/dashboard');
  }

  getCategories(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/categories');
  }

  getWarehouses(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/warehouses');
  }

  createWarehouse(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/warehouses', payload);
  }

  updateWarehouse(id: string, payload: any): Promise<any> {
    return this.api.patch<any>(`/inventory/warehouses/${id}`, payload);
  }

  getItems(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/items');
  }

  createItem(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/items', payload);
  }

  updateItem(id: string, payload: any): Promise<any> {
    return this.api.patch<any>(`/inventory/items/${id}`, payload);
  }

  getMovements(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/movements');
  }

  createMovement(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/movements', payload);
  }

  getPurchaseRequests(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/purchase-requests');
  }

  createPurchaseRequest(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/purchase-requests', payload);
  }

  updatePurchaseRequestStatus(id: string, status: string): Promise<any> {
    return this.api.patch<any>(`/inventory/purchase-requests/${id}/status`, { status });
  }

  getPurchaseOrders(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/purchase-orders');
  }

  createPurchaseOrder(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/purchase-orders', payload);
  }

  updatePurchaseOrderStatus(id: string, status: string): Promise<any> {
    return this.api.patch<any>(`/inventory/purchase-orders/${id}/status`, { status });
  }

  getGoodsReceipts(): Promise<any[]> {
    return this.api.get<any[]>('/inventory/goods-receipts');
  }

  createGoodsReceipt(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/goods-receipts', payload);
  }

  issueToStudent(payload: any): Promise<any> {
    return this.api.post<any>('/inventory/student-issues', payload);
  }

  getReports(): Promise<any> {
    return this.api.get<any>('/inventory/reports');
  }
}

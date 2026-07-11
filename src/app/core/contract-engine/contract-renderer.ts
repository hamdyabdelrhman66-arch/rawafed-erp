import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { ContractFieldBox } from './contract-fields';

const TEXT_PADDING = 2;
const MIN_FONT_SIZE = 4;

export function drawTextField(pdfPage: PDFPage, value: string, field: ContractFieldBox, font: PDFFont): void {
  if (field.type !== 'text') return;
  const text = String(value || '').trim();
  if (!text) return;

  const maxWidth = Math.max(1, field.width - TEXT_PADDING * 2);
  const fontSize = fitFontSize(text, field.fontSize, maxWidth, font);
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const x = field.x + (field.width - textWidth) / 2;
  const y = field.y + (field.height - fontSize) / 2 + field.offsetY;

  pdfPage.drawText(text, {
    x,
    y,
    size: fontSize,
    font,
    maxWidth
  });
}

export async function drawImageField(pdfDoc: PDFDocument, pdfPage: PDFPage, imageDataUrl: string, field: ContractFieldBox): Promise<void> {
  if (field.type !== 'image' || !imageDataUrl) return;

  const image = await embedImage(pdfDoc, imageDataUrl);
  const scale = Math.min(field.width / image.width, field.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  pdfPage.drawImage(image, {
    x: field.x + (field.width - width) / 2,
    y: field.y + (field.height - height) / 2 + field.offsetY,
    width,
    height
  });
}

export function drawCalibrationField(pdfPage: PDFPage, fieldName: string, field: ContractFieldBox, font: PDFFont): void {
  pdfPage.drawRectangle({
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    borderColor: rgb(1, 0, 0),
    borderWidth: 0.8
  });

  const label = `${fieldName} (${field.x}, ${field.y})`;
  const labelSize = fitFontSize(label, Math.min(6, field.fontSize), Math.max(1, field.width - 2), font);
  pdfPage.drawText(label, {
    x: field.x + 1,
    y: field.y + Math.max(1, (field.height - labelSize) / 2),
    size: labelSize,
    font,
    color: rgb(1, 0, 0),
    maxWidth: Math.max(1, field.width - 2)
  });
}

function fitFontSize(text: string, initialSize: number, maxWidth: number, font: PDFFont): number {
  let fontSize = initialSize;
  while (fontSize > MIN_FONT_SIZE && font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  while (fontSize > 1 && font.widthOfTextAtSize(text, fontSize) > maxWidth) {
    fontSize -= 0.25;
  }
  return fontSize;
}

async function embedImage(pdfDoc: PDFDocument, imageDataUrl: string): Promise<PDFImage> {
  const bytes = dataUrlToBytes(imageDataUrl);
  return imageDataUrl.startsWith('data:image/jpeg') || imageDataUrl.startsWith('data:image/jpg')
    ? await pdfDoc.embedJpg(bytes)
    : await pdfDoc.embedPng(bytes);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

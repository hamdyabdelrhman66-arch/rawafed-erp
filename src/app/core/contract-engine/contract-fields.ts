export type ContractFieldType = 'text' | 'image';
export type ContractFieldAlign = 'left' | 'center' | 'right';

export interface ContractFieldBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  align: ContractFieldAlign;
  offsetY: number;
  type: ContractFieldType;
}

export type ContractFieldName =
  | 'contractDayName'
  | 'contractGregorianDate'
  | 'parentNamePage1'
  | 'parentIdPage1'
  | 'parentPhonePage1'
  | 'parentEmailPage1'
  | 'studentNamePage1'
  | 'studentGradePage1'
  | 'totalFeesPage1'
  | 'parentNameDeclarationPage5'
  | 'studentNameDeclarationPage5'
  | 'parentNameSignaturePage5'
  | 'parentRoleSignaturePage5'
  | 'parentSignaturePage5'
  | 'signedDatePage5';

export const CONTRACT_FIELDS: Record<ContractFieldName, ContractFieldBox> = {
  contractDayName: {
    page: 1,
    x: 369.5,
    y: 615,
    width: 85,
    height: 19,
    fontSize: 10.5,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  contractGregorianDate: {
    page: 1,
    x: 246.5,
    y: 615,
    width: 113,
    height: 19,
    fontSize: 10.5,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentNamePage1: {
    page: 1,
    x: 24.5,
    y: 529.5,
    width: 151,
    height: 23,
    fontSize: 11,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentIdPage1: {
    page: 1,
    x: 355.5,
    y: 510.5,
    width: 81,
    height: 23,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentPhonePage1: {
    page: 1,
    x: 226.5,
    y: 508,
    width: 89.5,
    height: 23,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentEmailPage1: {
    page: 1,
    x: 35.5,
    y: 507,
    width: 155,
    height: 22.5,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  studentNamePage1: {
    page: 1,
    x: 223,
    y: 529,
    width: 126.5,
    height: 23,
    fontSize: 11,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  studentGradePage1: {
    page: 1,
    x: 329.5,
    y: 429.5,
    width: 79.5,
    height: 22.5,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  totalFeesPage1: {
    page: 1,
    x: 118.5,
    y: 428.5,
    width: 84.5,
    height: 23,
    fontSize: 9.5,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentNameDeclarationPage5: {
    page: 5,
    x: 370,
    y: 630.5,
    width: 84,
    height: 23,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  studentNameDeclarationPage5: {
    page: 5,
    x: 164.5,
    y: 631.5,
    width: 108.5,
    height: 23,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentNameSignaturePage5: {
    page: 5,
    x: 1.5,
    y: 461.5,
    width: 130,
    height: 23,
    fontSize: 11,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  },
  parentRoleSignaturePage5: {
    page: 5,
    x: 9.5,
    y: 447.5,
    width: 122,
    height: 15,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 1.5,
    type: 'text'
  },
  parentSignaturePage5: {
    page: 5,
    x: 7.5,
    y: 422.5,
    width: 119,
    height: 23.5,
    fontSize: 8,
    bold: false,
    align: 'center',
    offsetY: 0,
    type: 'image'
  },
  signedDatePage5: {
    page: 5,
    x: 7.5,
    y: 400.5,
    width: 120,
    height: 24,
    fontSize: 10,
    bold: true,
    align: 'center',
    offsetY: 2.5,
    type: 'text'
  }
};

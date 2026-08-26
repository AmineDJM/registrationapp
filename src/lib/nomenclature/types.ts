/** Days elapsed since 1970-01-01 (UTC). Timezone-proof unit used for every date comparison. */
export type DayNumber = number;

export type MedicineRegistration = {
  registrationNumber: string | null;
  dci: string;
  brandName: string | null;
  form: string | null;
  dosage: string | null;
  packaging: string | null;
  laboratory: string;
  laboratoryCountry: string | null;
  initialRegistrationDate: Date | null;
  finalRegistrationDate: Date | null;
  type: string | null;
  status: string | null;
};

/** A registration enriched with the grouping keys and the comparison-ready initial date. */
export type IndexedRegistration = MedicineRegistration & {
  laboratoryKey: string;
  dciKey: string;
  initialDay: DayNumber | null;
};

export type LaboratoryMolecule = {
  laboratory: string;
  dci: string;
  firstRegistrationDate: Date;
  registrationsCount: number;
  brands: string[];
};

export type LaboratorySummary = {
  laboratory: string;
  moleculesCount: number;
};

export type NomenclatureDataset = {
  registrations: IndexedRegistration[];
  /** Rows carrying a usable laboratory, DCI and initial registration date. */
  datedRegistrations: IndexedRegistration[];
  minDay: DayNumber | null;
  maxDay: DayNumber | null;
  totalRows: number;
  skipped: {
    missingInitialDate: number;
    missingLaboratory: number;
    missingDci: number;
  };
  sourceSheet: string;
  loadedAt: Date;
};

export type DayRange = {
  startDay: DayNumber;
  endDay: DayNumber;
};

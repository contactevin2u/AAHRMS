/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, PCB rates for 2024/2025
 *
 * EPF Third Schedule - Effective 1 October 2025 (Act A1760/2025)
 * SOCSO/EIS - Effective 1 October 2024 (Wage ceiling RM6,000)
 */

// Check if IC number is Malaysian format (YYMMDD-SS-NNNN or YYMMDDSSNNNN)
// Malaysian IC: 12 digits, first 6 are DOB (YYMMDD), next 2 are state code
const isMalaysianIC = (icNumber) => {
  if (!icNumber) return false;

  // Remove dashes and spaces
  const cleanIC = icNumber.replace(/[-\s]/g, '');

  // Must be 12 digits
  if (!/^\d{12}$/.test(cleanIC)) return false;

  // Validate date portion (YYMMDD)
  const year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  // Basic date validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // State codes (00-59 are valid Malaysian states)
  const stateCode = parseInt(cleanIC.substring(6, 8));
  // State codes 01-16 are Malaysian states, 21-59 are for born outside Malaysia but are still citizens
  // Foreign workers typically have passport numbers, not IC

  return true;
};

// Calculate age from Malaysian IC number
const calculateAgeFromIC = (icNumber) => {
  if (!icNumber) return null;

  const cleanIC = icNumber.replace(/[-\s]/g, '');
  if (cleanIC.length < 6) return null;

  const year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  // Determine century (00-24 = 2000s, 25-99 = 1900s)
  // As of 2025, anyone born in 2000 is 25, so 25+ is likely 1900s
  const currentYear = new Date().getFullYear();
  const currentYearShort = currentYear % 100;
  const fullYear = year <= currentYearShort ? 2000 + year : 1900 + year;

  const birthDate = new Date(fullYear, month - 1, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// EPF Contribution Rates - Third Schedule (Effective 1 October 2025)
// Based on KWSP Third Schedule - EPF Act 1991 as amended by Act A1760/2025
// Reference: https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution
//
// IMPORTANT: For wages UNDER RM20,000:
// - Contributions are based on wage brackets (Third Schedule)
// - Bracket sizes vary by wage level:
//   - Wages RM0 - RM5,000: RM20 brackets
//   - Wages RM5,001 - RM20,000: RM100 brackets
// - Calculated on the UPPER LIMIT of each bracket
// - Must be in whole ringgit (no cents)
//
// For wages RM20,000 AND ABOVE:
// - Direct percentage calculation allowed
// - Round to nearest ringgit
//
// Employee Types and Rates (Third Schedule effective 1 Oct 2025):
// Part A - Malaysian citizens, PRs, or those who elected before Aug 1998 (under 60):
//   - Employee: 11%
//   - Employer: 13% (wage <= RM5,000), 12% (wage > RM5,000)
// Part B - Deleted by Act A1760/2025
// Part C - Non-Malaysian PRs aged 60 and above:
//   - Employee: 5.5%
//   - Employer: 6.5% (wage <= RM5,000), 6% (wage > RM5,000)
// Part D - Deleted by Act A1760/2025
// Part E - Malaysian citizens aged 60 and above:
//   - Employee: 0%
//   - Employer: 4%
// Part F - Foreign workers (non-citizens, non-PRs):
//   - Employee: 2%
//   - Employer: 2%
//
// EPF Third Schedule Part A - Official KWSP contribution table (effective Oct 2025)
// Format: [maxWage, employeeContrib, employerContrib]
// RM20 increments up to RM5,000 (13% employer), RM100 increments RM5,001-RM20,000 (12% employer)
// Above RM20,000: 11% employee, 12% employer (percentage method, round up to next ringgit)
const EPF_TABLE = [
  [10, 0, 0], [20, 3, 3], [40, 5, 6], [60, 7, 8], [80, 9, 11], [100, 11, 13],
  [120, 14, 16], [140, 16, 19], [160, 18, 21], [180, 20, 24], [200, 22, 26],
  [220, 25, 29], [240, 27, 32], [260, 29, 34], [280, 31, 37], [300, 33, 39],
  [320, 36, 42], [340, 38, 45], [360, 40, 47], [380, 42, 50], [400, 44, 52],
  [420, 47, 55], [440, 49, 58], [460, 51, 60], [480, 53, 63], [500, 55, 65],
  [520, 58, 68], [540, 60, 71], [560, 62, 73], [580, 64, 76], [600, 66, 78],
  [620, 69, 81], [640, 71, 84], [660, 73, 86], [680, 75, 89], [700, 77, 91],
  [720, 80, 94], [740, 82, 97], [760, 84, 99], [780, 86, 102], [800, 88, 104],
  [820, 91, 107], [840, 93, 110], [860, 95, 112], [880, 97, 115], [900, 99, 117],
  [920, 102, 120], [940, 104, 123], [960, 106, 125], [980, 108, 128], [1000, 110, 130],
  [1020, 113, 133], [1040, 115, 136], [1060, 117, 138], [1080, 119, 141], [1100, 121, 143],
  [1120, 124, 146], [1140, 126, 149], [1160, 128, 151], [1180, 130, 154], [1200, 132, 156],
  [1220, 135, 159], [1240, 137, 162], [1260, 139, 164], [1280, 141, 167], [1300, 143, 169],
  [1320, 146, 172], [1340, 148, 175], [1360, 150, 177], [1380, 152, 180], [1400, 154, 182],
  [1420, 157, 185], [1440, 159, 188], [1460, 161, 190], [1480, 163, 193], [1500, 165, 195],
  [1520, 168, 198], [1540, 170, 201], [1560, 172, 203], [1580, 174, 206], [1600, 176, 208],
  [1620, 179, 211], [1640, 181, 214], [1660, 183, 216], [1680, 185, 219], [1700, 187, 221],
  [1720, 190, 224], [1740, 192, 227], [1760, 194, 229], [1780, 196, 232], [1800, 198, 234],
  [1820, 201, 237], [1840, 203, 240], [1860, 205, 242], [1880, 207, 245], [1900, 209, 247],
  [1920, 212, 250], [1940, 214, 253], [1960, 216, 255], [1980, 218, 258], [2000, 220, 260],
  [2020, 223, 263], [2040, 225, 266], [2060, 227, 268], [2080, 229, 271], [2100, 231, 273],
  [2120, 234, 276], [2140, 236, 279], [2160, 238, 281], [2180, 240, 284], [2200, 242, 286],
  [2220, 245, 289], [2240, 247, 292], [2260, 249, 294], [2280, 251, 297], [2300, 253, 299],
  [2320, 256, 302], [2340, 258, 305], [2360, 260, 307], [2380, 262, 310], [2400, 264, 312],
  [2420, 267, 315], [2440, 269, 318], [2460, 271, 320], [2480, 273, 323], [2500, 275, 325],
  [2520, 278, 328], [2540, 280, 331], [2560, 282, 333], [2580, 284, 336], [2600, 286, 338],
  [2620, 289, 341], [2640, 291, 344], [2660, 293, 346], [2680, 295, 349], [2700, 297, 351],
  [2720, 300, 354], [2740, 302, 357], [2760, 304, 359], [2780, 306, 362], [2800, 308, 364],
  [2820, 311, 367], [2840, 313, 370], [2860, 315, 372], [2880, 317, 375], [2900, 319, 377],
  [2920, 322, 380], [2940, 324, 383], [2960, 326, 385], [2980, 328, 388], [3000, 330, 390],
  [3020, 333, 393], [3040, 335, 396], [3060, 337, 398], [3080, 339, 401], [3100, 341, 403],
  [3120, 344, 406], [3140, 346, 409], [3160, 348, 411], [3180, 350, 414], [3200, 352, 416],
  [3220, 355, 419], [3240, 357, 422], [3260, 359, 424], [3280, 361, 427], [3300, 363, 429],
  [3320, 366, 432], [3340, 368, 435], [3360, 370, 437], [3380, 372, 440], [3400, 374, 442],
  [3420, 377, 445], [3440, 379, 448], [3460, 381, 450], [3480, 383, 453], [3500, 385, 455],
  [3520, 388, 458], [3540, 390, 461], [3560, 392, 463], [3580, 394, 466], [3600, 396, 468],
  [3620, 399, 471], [3640, 401, 474], [3660, 403, 476], [3680, 405, 479], [3700, 407, 481],
  [3720, 410, 484], [3740, 412, 487], [3760, 414, 489], [3780, 416, 492], [3800, 418, 494],
  [3820, 421, 497], [3840, 423, 500], [3860, 425, 502], [3880, 427, 505], [3900, 429, 507],
  [3920, 432, 510], [3940, 434, 513], [3960, 436, 515], [3980, 438, 518], [4000, 440, 520],
  [4020, 443, 523], [4040, 445, 526], [4060, 447, 528], [4080, 449, 531], [4100, 451, 533],
  [4120, 454, 536], [4140, 456, 539], [4160, 458, 541], [4180, 460, 544], [4200, 462, 546],
  [4220, 465, 549], [4240, 467, 552], [4260, 469, 554], [4280, 471, 557], [4300, 473, 559],
  [4320, 476, 562], [4340, 478, 565], [4360, 480, 567], [4380, 482, 570], [4400, 484, 572],
  [4420, 487, 575], [4440, 489, 578], [4460, 491, 580], [4480, 493, 583], [4500, 495, 585],
  [4520, 498, 588], [4540, 500, 591], [4560, 502, 593], [4580, 504, 596], [4600, 506, 598],
  [4620, 509, 601], [4640, 511, 604], [4660, 513, 606], [4680, 515, 609], [4700, 517, 611],
  [4720, 520, 614], [4740, 522, 617], [4760, 524, 619], [4780, 526, 622], [4800, 528, 624],
  [4820, 531, 627], [4840, 533, 630], [4860, 535, 632], [4880, 537, 635], [4900, 539, 637],
  [4920, 542, 640], [4940, 544, 643], [4960, 546, 645], [4980, 548, 648], [5000, 550, 650],
  // Above RM5,000: RM100 increments, employer rate drops to 12%
  [5100, 561, 612], [5200, 572, 624], [5300, 583, 636], [5400, 594, 648], [5500, 605, 660],
  [5600, 616, 672], [5700, 627, 684], [5800, 638, 696], [5900, 649, 708], [6000, 660, 720],
  [6100, 671, 732], [6200, 682, 744], [6300, 693, 756], [6400, 704, 768], [6500, 715, 780],
  [6600, 726, 792], [6700, 737, 804], [6800, 748, 816], [6900, 759, 828], [7000, 770, 840],
  [7100, 781, 852], [7200, 792, 864], [7300, 803, 876], [7400, 814, 888], [7500, 825, 900],
  [7600, 836, 912], [7700, 847, 924], [7800, 858, 936], [7900, 869, 948], [8000, 880, 960],
  [8100, 891, 972], [8200, 902, 984], [8300, 913, 996], [8400, 924, 1008], [8500, 935, 1020],
  [8600, 946, 1032], [8700, 957, 1044], [8800, 968, 1056], [8900, 979, 1068], [9000, 990, 1080],
  [9100, 1001, 1092], [9200, 1012, 1104], [9300, 1023, 1116], [9400, 1034, 1128], [9500, 1045, 1140],
  [9600, 1056, 1152], [9700, 1067, 1164], [9800, 1078, 1176], [9900, 1089, 1188], [10000, 1100, 1200],
  [10100, 1111, 1212], [10200, 1122, 1224], [10300, 1133, 1236], [10400, 1144, 1248], [10500, 1155, 1260],
  [10600, 1166, 1272], [10700, 1177, 1284], [10800, 1188, 1296], [10900, 1199, 1308], [11000, 1210, 1320],
  [11100, 1221, 1332], [11200, 1232, 1344], [11300, 1243, 1356], [11400, 1254, 1368], [11500, 1265, 1380],
  [11600, 1276, 1392], [11700, 1287, 1404], [11800, 1298, 1416], [11900, 1309, 1428], [12000, 1320, 1440],
  [12100, 1331, 1452], [12200, 1342, 1464], [12300, 1353, 1476], [12400, 1364, 1488], [12500, 1375, 1500],
  [12600, 1386, 1512], [12700, 1397, 1524], [12800, 1408, 1536], [12900, 1419, 1548], [13000, 1430, 1560],
  [13100, 1441, 1572], [13200, 1452, 1584], [13300, 1463, 1596], [13400, 1474, 1608], [13500, 1485, 1620],
  [13600, 1496, 1632], [13700, 1507, 1644], [13800, 1518, 1656], [13900, 1529, 1668], [14000, 1540, 1680],
  [14100, 1551, 1692], [14200, 1562, 1704], [14300, 1573, 1716], [14400, 1584, 1728], [14500, 1595, 1740],
  [14600, 1606, 1752], [14700, 1617, 1764], [14800, 1628, 1776], [14900, 1639, 1788], [15000, 1650, 1800],
  [15100, 1661, 1812], [15200, 1672, 1824], [15300, 1683, 1836], [15400, 1694, 1848], [15500, 1705, 1860],
  [15600, 1716, 1872], [15700, 1727, 1884], [15800, 1738, 1896], [15900, 1749, 1908], [16000, 1760, 1920],
  [16100, 1771, 1932], [16200, 1782, 1944], [16300, 1793, 1956], [16400, 1804, 1968], [16500, 1815, 1980],
  [16600, 1826, 1992], [16700, 1837, 2004], [16800, 1848, 2016], [16900, 1859, 2028], [17000, 1870, 2040],
  [17100, 1881, 2052], [17200, 1892, 2064], [17300, 1903, 2076], [17400, 1914, 2088], [17500, 1925, 2100],
  [17600, 1936, 2112], [17700, 1947, 2124], [17800, 1958, 2136], [17900, 1969, 2148], [18000, 1980, 2160],
  [18100, 1991, 2172], [18200, 2002, 2184], [18300, 2013, 2196], [18400, 2024, 2208], [18500, 2035, 2220],
  [18600, 2046, 2232], [18700, 2057, 2244], [18800, 2068, 2256], [18900, 2079, 2268], [19000, 2090, 2280],
  [19100, 2101, 2292], [19200, 2112, 2304], [19300, 2123, 2316], [19400, 2134, 2328], [19500, 2145, 2340],
  [19600, 2156, 2352], [19700, 2167, 2364], [19800, 2178, 2376], [19900, 2189, 2388], [20000, 2200, 2400],
];

// employeeType: 'malaysian' (default), 'pr' (permanent resident), 'foreign' (foreign worker)
const calculateEPF = (grossSalary, age = 30, contributionType = 'normal', employeeType = 'malaysian') => {
  if (!grossSalary || grossSalary <= 0) {
    return { employee: 0, employer: 0 };
  }

  // Handle backward compatibility - convert boolean isMalaysian to employeeType
  if (typeof employeeType === 'boolean') {
    employeeType = employeeType ? 'malaysian' : 'foreign';
  }

  // Special rates for foreign workers and elderly
  if (employeeType === 'foreign') {
    // Part F - Foreign workers: 2% each
    return {
      employee: Math.round(grossSalary * 0.02),
      employer: Math.round(grossSalary * 0.02)
    };
  }

  if (age >= 60) {
    if (employeeType === 'pr') {
      // Part C - Non-Malaysian PRs aged 60+: Employee 5.5%, Employer 6.5%/6%
      const employerRate = grossSalary <= 5000 ? 0.065 : 0.06;
      return {
        employee: Math.round(grossSalary * 0.055),
        employer: Math.round(grossSalary * employerRate)
      };
    } else {
      // Part E - Malaysian citizens aged 60+: Employee 0%, Employer 4%
      return {
        employee: 0,
        employer: Math.round(grossSalary * 0.04)
      };
    }
  }

  // Part A - Malaysian citizens, PRs under 60: Use KWSP Third Schedule table
  // For wages up to RM20,000, use the official contribution table
  for (const [maxWage, ee, er] of EPF_TABLE) {
    if (grossSalary <= maxWage) {
      return { employee: ee, employer: er };
    }
  }

  // For wages above RM20,000: 11% employee, 12% employer (percentage method)
  // Total contribution including cents shall be rounded to the next ringgit
  return {
    employee: Math.ceil(grossSalary * 0.11),
    employer: Math.ceil(grossSalary * 0.12)
  };
};

// SOCSO Contribution Table
// Ceiling: RM5,000
// Category 1: Employment Injury + Invalidity (age < 60)
// Category 2: Employment Injury only (age >= 60)
// Source: https://payroll.my/payroll-software/socso-contribution-table
const SOCSO_TABLE = [
  { min: 0, max: 30, ee: 0.10, er: 0.40 },
  { min: 30.01, max: 50, ee: 0.20, er: 0.70 },
  { min: 50.01, max: 70, ee: 0.30, er: 1.10 },
  { min: 70.01, max: 100, ee: 0.40, er: 1.50 },
  { min: 100.01, max: 140, ee: 0.60, er: 2.10 },
  { min: 140.01, max: 200, ee: 0.85, er: 2.95 },
  { min: 200.01, max: 300, ee: 1.25, er: 4.35 },
  { min: 300.01, max: 400, ee: 1.75, er: 6.15 },
  { min: 400.01, max: 500, ee: 2.25, er: 7.85 },
  { min: 500.01, max: 600, ee: 2.75, er: 9.65 },
  { min: 600.01, max: 700, ee: 3.25, er: 11.35 },
  { min: 700.01, max: 800, ee: 3.75, er: 13.15 },
  { min: 800.01, max: 900, ee: 4.25, er: 14.85 },
  { min: 900.01, max: 1000, ee: 4.75, er: 16.65 },
  { min: 1000.01, max: 1100, ee: 5.25, er: 18.35 },
  { min: 1100.01, max: 1200, ee: 5.75, er: 20.15 },
  { min: 1200.01, max: 1300, ee: 6.25, er: 21.85 },
  { min: 1300.01, max: 1400, ee: 6.75, er: 23.65 },
  { min: 1400.01, max: 1500, ee: 7.25, er: 25.35 },
  { min: 1500.01, max: 1600, ee: 7.75, er: 27.15 },
  { min: 1600.01, max: 1700, ee: 8.25, er: 28.85 },
  { min: 1700.01, max: 1800, ee: 8.75, er: 30.65 },
  { min: 1800.01, max: 1900, ee: 9.25, er: 32.35 },
  { min: 1900.01, max: 2000, ee: 9.75, er: 34.15 },
  { min: 2000.01, max: 2100, ee: 10.25, er: 35.85 },
  { min: 2100.01, max: 2200, ee: 10.75, er: 37.65 },
  { min: 2200.01, max: 2300, ee: 11.25, er: 39.35 },
  { min: 2300.01, max: 2400, ee: 11.75, er: 41.15 },
  { min: 2400.01, max: 2500, ee: 12.25, er: 42.85 },
  { min: 2500.01, max: 2600, ee: 12.75, er: 44.65 },
  { min: 2600.01, max: 2700, ee: 13.25, er: 46.35 },
  { min: 2700.01, max: 2800, ee: 13.75, er: 48.15 },
  { min: 2800.01, max: 2900, ee: 14.25, er: 49.85 },
  { min: 2900.01, max: 3000, ee: 14.75, er: 51.65 },
  { min: 3000.01, max: 3100, ee: 15.25, er: 53.35 },
  { min: 3100.01, max: 3200, ee: 15.75, er: 55.15 },
  { min: 3200.01, max: 3300, ee: 16.25, er: 56.85 },
  { min: 3300.01, max: 3400, ee: 16.75, er: 58.65 },
  { min: 3400.01, max: 3500, ee: 17.25, er: 60.35 },
  { min: 3500.01, max: 3600, ee: 17.75, er: 62.15 },
  { min: 3600.01, max: 3700, ee: 18.25, er: 63.85 },
  { min: 3700.01, max: 3800, ee: 18.75, er: 65.65 },
  { min: 3800.01, max: 3900, ee: 19.25, er: 67.35 },
  { min: 3900.01, max: 4000, ee: 19.75, er: 69.15 },
  { min: 4000.01, max: 4100, ee: 20.25, er: 70.85 },
  { min: 4100.01, max: 4200, ee: 20.75, er: 72.65 },
  { min: 4200.01, max: 4300, ee: 21.25, er: 74.35 },
  { min: 4300.01, max: 4400, ee: 21.75, er: 76.15 },
  { min: 4400.01, max: 4500, ee: 22.25, er: 77.85 },
  { min: 4500.01, max: 4600, ee: 22.75, er: 79.65 },
  { min: 4600.01, max: 4700, ee: 23.25, er: 81.35 },
  { min: 4700.01, max: 4800, ee: 23.75, er: 83.15 },
  { min: 4800.01, max: 4900, ee: 24.25, er: 84.85 },
  { min: 4900.01, max: 5000, ee: 24.75, er: 86.65 },
  { min: 5000.01, max: 5100, ee: 25.25, er: 88.35 },
  { min: 5100.01, max: 5200, ee: 25.75, er: 90.15 },
  { min: 5200.01, max: 5300, ee: 26.25, er: 91.85 },
  { min: 5300.01, max: 5400, ee: 26.75, er: 93.65 },
  { min: 5400.01, max: 5500, ee: 27.25, er: 95.35 },
  { min: 5500.01, max: 5600, ee: 27.75, er: 97.15 },
  { min: 5600.01, max: 5700, ee: 28.25, er: 98.85 },
  { min: 5700.01, max: 5800, ee: 28.75, er: 100.65 },
  { min: 5800.01, max: 5900, ee: 29.25, er: 102.35 },
  { min: 5900.01, max: 6000, ee: 29.75, er: 104.15 },
];

const calculateSOCSO = (grossSalary, age = 30) => {
  // No contribution if salary is zero or negative
  if (!grossSalary || grossSalary <= 0) {
    return { employee: 0, employer: 0 };
  }

  // SOCSO ceiling is RM6000 (effective Oct 2024)
  if (grossSalary > 6000) {
    // Max contribution for salary > RM6000
    return { employee: 29.75, employer: 104.15 };
  }

  const bracket = SOCSO_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);

  if (!bracket) {
    return { employee: 0, employer: 0 };
  }

  // Category 2 (age >= 60): only employer contribution for employment injury
  if (age >= 60) {
    return { employee: 0, employer: bracket.er };
  }

  return {
    employee: bracket.ee,
    employer: bracket.er
  };
};

// EIS (Employment Insurance System) Contribution Table
// Ceiling: RM5,000
const EIS_TABLE = [
  { min: 0, max: 30, ee: 0.05, er: 0.05 },
  { min: 30.01, max: 50, ee: 0.10, er: 0.10 },
  { min: 50.01, max: 70, ee: 0.15, er: 0.15 },
  { min: 70.01, max: 100, ee: 0.20, er: 0.20 },
  { min: 100.01, max: 140, ee: 0.25, er: 0.25 },
  { min: 140.01, max: 200, ee: 0.35, er: 0.35 },
  { min: 200.01, max: 300, ee: 0.50, er: 0.50 },
  { min: 300.01, max: 400, ee: 0.70, er: 0.70 },
  { min: 400.01, max: 500, ee: 0.90, er: 0.90 },
  { min: 500.01, max: 600, ee: 1.10, er: 1.10 },
  { min: 600.01, max: 700, ee: 1.30, er: 1.30 },
  { min: 700.01, max: 800, ee: 1.50, er: 1.50 },
  { min: 800.01, max: 900, ee: 1.70, er: 1.70 },
  { min: 900.01, max: 1000, ee: 1.90, er: 1.90 },
  { min: 1000.01, max: 1100, ee: 2.10, er: 2.10 },
  { min: 1100.01, max: 1200, ee: 2.30, er: 2.30 },
  { min: 1200.01, max: 1300, ee: 2.50, er: 2.50 },
  { min: 1300.01, max: 1400, ee: 2.70, er: 2.70 },
  { min: 1400.01, max: 1500, ee: 2.90, er: 2.90 },
  { min: 1500.01, max: 1600, ee: 3.10, er: 3.10 },
  { min: 1600.01, max: 1700, ee: 3.30, er: 3.30 },
  { min: 1700.01, max: 1800, ee: 3.50, er: 3.50 },
  { min: 1800.01, max: 1900, ee: 3.70, er: 3.70 },
  { min: 1900.01, max: 2000, ee: 3.90, er: 3.90 },
  { min: 2000.01, max: 2100, ee: 4.10, er: 4.10 },
  { min: 2100.01, max: 2200, ee: 4.30, er: 4.30 },
  { min: 2200.01, max: 2300, ee: 4.50, er: 4.50 },
  { min: 2300.01, max: 2400, ee: 4.70, er: 4.70 },
  { min: 2400.01, max: 2500, ee: 4.90, er: 4.90 },
  { min: 2500.01, max: 2600, ee: 5.10, er: 5.10 },
  { min: 2600.01, max: 2700, ee: 5.30, er: 5.30 },
  { min: 2700.01, max: 2800, ee: 5.50, er: 5.50 },
  { min: 2800.01, max: 2900, ee: 5.70, er: 5.70 },
  { min: 2900.01, max: 3000, ee: 5.90, er: 5.90 },
  { min: 3000.01, max: 3100, ee: 6.10, er: 6.10 },
  { min: 3100.01, max: 3200, ee: 6.30, er: 6.30 },
  { min: 3200.01, max: 3300, ee: 6.50, er: 6.50 },
  { min: 3300.01, max: 3400, ee: 6.70, er: 6.70 },
  { min: 3400.01, max: 3500, ee: 6.90, er: 6.90 },
  { min: 3500.01, max: 3600, ee: 7.10, er: 7.10 },
  { min: 3600.01, max: 3700, ee: 7.30, er: 7.30 },
  { min: 3700.01, max: 3800, ee: 7.50, er: 7.50 },
  { min: 3800.01, max: 3900, ee: 7.70, er: 7.70 },
  { min: 3900.01, max: 4000, ee: 7.90, er: 7.90 },
  { min: 4000.01, max: 4100, ee: 8.10, er: 8.10 },
  { min: 4100.01, max: 4200, ee: 8.30, er: 8.30 },
  { min: 4200.01, max: 4300, ee: 8.50, er: 8.50 },
  { min: 4300.01, max: 4400, ee: 8.70, er: 8.70 },
  { min: 4400.01, max: 4500, ee: 8.90, er: 8.90 },
  { min: 4500.01, max: 4600, ee: 9.10, er: 9.10 },
  { min: 4600.01, max: 4700, ee: 9.30, er: 9.30 },
  { min: 4700.01, max: 4800, ee: 9.50, er: 9.50 },
  { min: 4800.01, max: 4900, ee: 9.70, er: 9.70 },
  { min: 4900.01, max: 5000, ee: 9.90, er: 9.90 },
  { min: 5000.01, max: 5100, ee: 10.10, er: 10.10 },
  { min: 5100.01, max: 5200, ee: 10.30, er: 10.30 },
  { min: 5200.01, max: 5300, ee: 10.50, er: 10.50 },
  { min: 5300.01, max: 5400, ee: 10.70, er: 10.70 },
  { min: 5400.01, max: 5500, ee: 10.90, er: 10.90 },
  { min: 5500.01, max: 5600, ee: 11.10, er: 11.10 },
  { min: 5600.01, max: 5700, ee: 11.30, er: 11.30 },
  { min: 5700.01, max: 5800, ee: 11.50, er: 11.50 },
  { min: 5800.01, max: 5900, ee: 11.70, er: 11.70 },
  { min: 5900.01, max: 6000, ee: 11.90, er: 11.90 },
];

// EIS (Employment Insurance System)
// Uses contribution table, ceiling RM5000
const calculateEIS = (grossSalary, age = 30) => {
  // No contribution if salary is zero or negative
  if (!grossSalary || grossSalary <= 0) {
    return { employee: 0, employer: 0 };
  }

  // EIS not applicable for age >= 57
  if (age >= 57) {
    return { employee: 0, employer: 0 };
  }

  // EIS ceiling is RM6000 (effective Oct 2024)
  if (grossSalary > 6000) {
    // Max contribution for salary > RM6000
    return { employee: 11.90, employer: 11.90 };
  }

  const bracket = EIS_TABLE.find(b => grossSalary >= b.min && grossSalary <= b.max);

  if (!bracket) {
    return { employee: 0, employer: 0 };
  }

  return {
    employee: bracket.ee,
    employer: bracket.er
  };
};

// =====================================================
// PCB (Monthly Tax Deduction) - Full LHDN Computerized Method
// Reference: Official LHDN PCB Calculation Formula
// =====================================================
//
// FORMULA:
// 1. Normal STD = [(P - M) × R + B - (Z + X)] / (n + 1)
// 2. Additional STD = Total Tax - (Total STD for year + Z)
// 3. Current Month PCB = Normal STD + Additional STD
//
// WHERE:
// P = Chargeable Income for the year
//   = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (Yt-Kt)] - [D + S + DU + SU + (2000*C) + (ELP+LP1)]
//
// E(Y-K) = Accumulated net remuneration (gross - EPF) from previous months
// Y1 = Current month normal remuneration
// K1 = EPF on current month (subject to RM4,000/year cap)
// Y2 = Estimated future monthly remuneration (usually same as Y1)
// K2 = Estimated future EPF (subject to remaining cap)
// n = Remaining months after current month
// Yt = Additional remuneration (bonus, commission) for current month
// Kt = EPF on additional remuneration (subject to cap)
// D = Individual relief (RM9,000)
// S = Spouse relief (RM4,000 if not working)
// DU = Disabled individual relief (RM7,000)
// SU = Disabled spouse relief (RM6,000)
// C = Number of qualifying children
// ELP = Accumulated other deductions
// LP1 = Current month other deductions
// M = Tax bracket threshold
// R = Tax rate
// B = Base tax amount (after rebate)
// Z = Accumulated zakat paid
// X = Accumulated PCB paid

// Tax brackets for YA 2023/2024/2025 - LHDN official rates
// Source: https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-rate/
// B values = Cumulative tax at M - Rebate (RM400 for Category 1/3, RM800 for Category 2)
//
// Chargeable Income | Rate | Cumulative Tax (Base)
// 0 - 5,000         | 0%   | 0
// 5,001 - 20,000    | 1%   | 0
// 20,001 - 35,000   | 3%   | 150
// 35,001 - 50,000   | 6%   | 600
// 50,001 - 70,000   | 11%  | 1,500
// 70,001 - 100,000  | 19%  | 3,700
// 100,001 - 400,000 | 25%  | 9,400
// 400,001 - 600,000 | 26%  | 84,400
// 600,001 - 2,000,000 | 28% | 136,400
// Above 2,000,000   | 30%  | 528,400
//
// REBATE: RM 400 (Category 1) or RM 800 (Category 2) ONLY if P <= RM 35,000
// B = Base cumulative tax. Rebate is applied separately based on P.
const TAX_BRACKETS_LHDN = [
  { min: 0, max: 5000, M: 0, R: 0, B: 0 },
  { min: 5001, max: 20000, M: 5000, R: 0.01, B: 0 },
  { min: 20001, max: 35000, M: 20000, R: 0.03, B: 150 },
  { min: 35001, max: 50000, M: 35000, R: 0.06, B: 600 },
  { min: 50001, max: 70000, M: 50000, R: 0.11, B: 1500 },
  { min: 70001, max: 100000, M: 70000, R: 0.19, B: 3700 },
  { min: 100001, max: 400000, M: 100000, R: 0.25, B: 9400 },
  { min: 400001, max: 600000, M: 400000, R: 0.26, B: 84400 },
  { min: 600001, max: 2000000, M: 600000, R: 0.28, B: 136400 },
  { min: 2000001, max: Infinity, M: 2000000, R: 0.30, B: 528400 }
];

// Rebate amounts (only apply if chargeable income P <= RM 35,000)
const TAX_REBATE_THRESHOLD = 35000;
const TAX_REBATE_CATEGORY1 = 400;  // Single, or Married spouse not claiming
const TAX_REBATE_CATEGORY2 = 800;  // Married, spouse not working

// Keep old name for backward compatibility
const TAX_BRACKETS = TAX_BRACKETS_LHDN;

/**
 * Get tax bracket for a given chargeable income
 */
const getTaxBracket = (chargeableIncome) => {
  for (const bracket of TAX_BRACKETS_LHDN) {
    if (chargeableIncome >= bracket.min && chargeableIncome <= bracket.max) {
      return bracket;
    }
  }
  return TAX_BRACKETS_LHDN[TAX_BRACKETS_LHDN.length - 1];
};

/**
 * Calculate annual tax using LHDN formula: (P - M) × R + B - rebate
 * Rebate only applies if chargeable income <= RM 35,000
 */
const calculateAnnualTax = (chargeableIncome, isCategory2 = false) => {
  const bracket = getTaxBracket(chargeableIncome);
  const rebateAmount = isCategory2 ? TAX_REBATE_CATEGORY2 : TAX_REBATE_CATEGORY1;
  const rebate = chargeableIncome <= TAX_REBATE_THRESHOLD ? rebateAmount : 0;
  const tax = ((chargeableIncome - bracket.M) * bracket.R) + bracket.B - rebate;
  return Math.max(0, tax);
};

/**
 * Truncate to 2 decimal places (LHDN method for intermediate calculations)
 * LHDN uses truncation (floor), not rounding, for intermediate values
 */
const truncate2dp = (val) => Math.floor(val * 100) / 100;

/**
 * Round to 2 decimal places (standard rounding)
 */
const round2dp = (val) => Math.round(val * 100) / 100;

/**
 * Full LHDN PCB Calculation
 *
 * @param {Object} params - PCB calculation parameters
 * @param {number} params.normalRemuneration - Y1: Current month normal salary (basic + fixed allowance)
 * @param {number} params.additionalRemuneration - Yt: Bonus, commission, incentives for current month
 * @param {number} params.currentMonth - 1-12 (January = 1)
 * @param {number} params.accumulatedGross - E(Y): Total gross from previous months (Jan to previous month)
 * @param {number} params.accumulatedEPF - E(K): Total EPF from previous months
 * @param {number} params.accumulatedPCB - X: Total PCB paid from previous months
 * @param {number} params.accumulatedZakat - Z: Total zakat paid from previous months
 * @param {number} params.currentMonthZakat - Zakat for current month
 * @param {string} params.maritalStatus - 'single' or 'married'
 * @param {boolean} params.spouseWorking - true if spouse has income
 * @param {number} params.childrenCount - Number of qualifying children
 * @param {boolean} params.isDisabled - Employee is disabled (RM7,000 additional relief)
 * @param {boolean} params.spouseDisabled - Spouse is disabled (RM6,000 additional relief)
 * @param {number} params.otherDeductions - ELP + LP1: Life insurance, education fees, etc.
 * @param {number} params.epfRate - EPF rate (default 0.11 = 11%)
 * @returns {Object} - PCB calculation result with breakdown
 */
const calculatePCBFull = (params) => {
  const {
    normalRemuneration = 0,        // Y1
    additionalRemuneration = 0,    // Yt (bonus, commission)
    currentMonth = new Date().getMonth() + 1,
    accumulatedGross = 0,          // E(Y) - total gross Jan to previous month
    accumulatedEPF = 0,            // E(K) - total EPF Jan to previous month
    accumulatedPCB = 0,            // X - total PCB paid
    accumulatedZakat = 0,          // Z - total zakat paid (excluding current month)
    currentMonthZakat = 0,         // Zakat for current month
    maritalStatus = 'single',
    spouseWorking = false,
    childrenCount = 0,
    isDisabled = false,
    spouseDisabled = false,
    otherDeductions = 0,           // ELP + LP1
    epfRate = 0.11,
    actualEPFNormal = null,        // Actual EPF on normal salary (if different from calculated)
    actualEPFAdditional = null     // Actual EPF on additional salary (if different from calculated)
  } = params;

  // EPF cap is RM4,000 per year for tax relief
  const EPF_CAP = 4000;

  // n = remaining months after current month
  // n+1 = remaining months including current month
  const n = 12 - currentMonth;
  const nPlus1 = n + 1;

  // Calculate EPF amounts
  const Y1 = normalRemuneration;
  const Yt = additionalRemuneration;
  const Y = accumulatedGross; // E(Y)
  const K = accumulatedEPF;   // E(K)

  // K1 = EPF on current month normal remuneration (subject to cap)
  // Use actual EPF if provided (for cases where EPF base differs from PCB base)
  // LHDN uses truncation to 2 decimal places for EPF relief values
  const remainingEPFCap = Math.max(0, EPF_CAP - K);
  let K1;
  if (actualEPFNormal !== null) {
    K1 = truncate2dp(Math.min(actualEPFNormal, remainingEPFCap));
  } else {
    const epfOnY1 = truncate2dp(Y1 * epfRate);
    K1 = truncate2dp(Math.min(epfOnY1, remainingEPFCap));
  }

  // Kt = EPF on additional remuneration (subject to cap)
  const remainingEPFCapAfterK1 = Math.max(0, EPF_CAP - K - K1);
  let Kt;
  if (actualEPFAdditional !== null) {
    Kt = truncate2dp(Math.min(actualEPFAdditional, remainingEPFCapAfterK1));
  } else {
    const epfOnYt = truncate2dp(Yt * epfRate);
    Kt = truncate2dp(Math.min(epfOnYt, remainingEPFCapAfterK1));
  }

  // Y2 = Estimated future monthly remuneration (assume same as Y1)
  const Y2 = Y1;

  // K2 = Estimated future EPF per month (subject to remaining cap)
  // LHDN Formula: K2 = min([4000 - (K + K1 + Kt)] / n, K1)
  // If actualEPFNormal provided, use it as basis for K2 (same EPF pattern)
  const epfOnY2 = actualEPFNormal !== null
    ? actualEPFNormal
    : truncate2dp(Y2 * epfRate);
  const remainingEPFForFuture = Math.max(0, EPF_CAP - K - K1 - Kt);
  // K2 = min(remaining/n, K1) - use K1 as the cap, not epfOnY2
  const K2 = n > 0 ? truncate2dp(Math.min(remainingEPFForFuture / n, K1)) : 0;

  // Total EPF for tax relief (EK)
  const EK = K + K1 + (K2 * n) + Kt;
  const epfRelief = Math.min(EK, EPF_CAP);

  // Calculate E(Y-K) = accumulated net remuneration
  const EYminusK = Y - K;

  // Tax Reliefs
  const D = 9000;  // Individual relief
  const S = (maritalStatus === 'married' && !spouseWorking) ? 4000 : 0;  // Spouse relief
  const DU = isDisabled ? 7000 : 0;  // Disabled individual
  const SU = spouseDisabled ? 6000 : 0;  // Disabled spouse
  const C = childrenCount;  // Number of children
  const childRelief = 2000 * C;
  const ELP_LP1 = otherDeductions;

  // Total deductions
  const totalDeductions = D + S + DU + SU + childRelief + ELP_LP1;

  // Determine tax category
  // Category 1 & 3: Single OR Married with working spouse (RM400 rebate if P <= 35000)
  // Category 2: Married with non-working spouse (RM800 rebate if P <= 35000)
  const isCategory2 = maritalStatus === 'married' && !spouseWorking;
  const rebateAmount = isCategory2 ? TAX_REBATE_CATEGORY2 : TAX_REBATE_CATEGORY1;

  // =====================================================
  // STEP 1: Calculate Normal STD (when Yt = 0)
  // =====================================================

  // P for normal calculation (without additional remuneration)
  // P = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (0-0)] - deductions
  // LHDN truncates intermediate sums to 2 decimal places
  const netCurrentMonth = truncate2dp(Y1 - K1);
  const netFutureMonths = truncate2dp((Y2 - K2) * n);
  const P_normal = truncate2dp(EYminusK + netCurrentMonth + netFutureMonths - totalDeductions);

  // Adjust P for EPF relief (EPF is already subtracted, but we need to ensure cap)
  const P_normalAdjusted = Math.max(0, P_normal);

  const bracket_normal = getTaxBracket(P_normalAdjusted);
  const M = bracket_normal.M;
  const R = bracket_normal.R;
  const B = bracket_normal.B;  // Base tax without rebate

  // Apply rebate ONLY if chargeable income <= RM 35,000
  const rebate_normal = P_normalAdjusted <= TAX_REBATE_THRESHOLD ? rebateAmount : 0;
  const B_adjusted = B - rebate_normal;

  const Z = accumulatedZakat;
  const X = accumulatedPCB;

  // Normal STD = [(P - M) × R + B - rebate - (Z + X)] / (n + 1)
  // LHDN truncates annual tax to 2dp, then truncates division result
  const taxBeforeDivide = truncate2dp((P_normalAdjusted - M) * R + B_adjusted);
  let normalSTD = truncate2dp((taxBeforeDivide - (Z + X)) / nPlus1);
  normalSTD = Math.max(0, normalSTD);

  // =====================================================
  // STEP 2: Calculate Additional STD (when Yt > 0)
  // =====================================================

  let additionalSTD = 0;
  let P_withAdditionalAdjusted = null;

  if (Yt > 0) {
    // Total STD for a year (if no additional remuneration)
    const totalSTDForYear = truncate2dp(X + (normalSTD * nPlus1));

    // P with additional remuneration
    // P = [E(Y-K) + (Y1-K1) + (Y2-K2)*n + (Yt-Kt)] - deductions
    const netAdditional = truncate2dp(Yt - Kt);
    const P_withAdditional = truncate2dp(EYminusK + netCurrentMonth + netFutureMonths + netAdditional - totalDeductions);
    P_withAdditionalAdjusted = Math.max(0, P_withAdditional);

    // Total Tax with additional remuneration
    const bracket_additional = getTaxBracket(P_withAdditionalAdjusted);
    const M_add = bracket_additional.M;
    const R_add = bracket_additional.R;
    const B_add = bracket_additional.B;  // Base tax without rebate

    // Apply rebate ONLY if chargeable income <= RM 35,000
    const rebate_add = P_withAdditionalAdjusted <= TAX_REBATE_THRESHOLD ? rebateAmount : 0;
    // LHDN truncates total tax to 2dp
    const totalTax = truncate2dp((P_withAdditionalAdjusted - M_add) * R_add + B_add - rebate_add);

    // Additional STD = Total Tax - (Total STD for year + Z)
    additionalSTD = truncate2dp(Math.max(0, totalTax - (totalSTDForYear + Z)));
  }

  // =====================================================
  // STEP 3: Calculate Current Month PCB
  // =====================================================

  // Net STD = Normal STD - current month zakat
  const netSTD = Math.max(0, normalSTD - currentMonthZakat);

  // Current Month STD = Net STD + Additional STD
  let currentMonthSTD = netSTD + additionalSTD;

  // Round up to nearest 5 cents (LHDN requirement)
  currentMonthSTD = Math.ceil(currentMonthSTD * 20) / 20;

  // Return detailed breakdown
  return {
    // Final PCB amount
    pcb: currentMonthSTD,

    // Breakdown
    normalSTD: round2dp(normalSTD),
    additionalSTD: round2dp(additionalSTD),
    netSTD: round2dp(netSTD),

    // Input values used
    Y1,
    K1,
    Y2,
    K2,
    Yt,
    Kt,
    n,
    nPlus1,

    // Chargeable income
    P_normal: round2dp(P_normalAdjusted),
    P_withAdditional: P_withAdditionalAdjusted,

    // Tax bracket used
    M,
    R: R * 100, // as percentage
    B,

    // Accumulated values
    accumulatedGross: Y,
    accumulatedEPF: K,
    accumulatedPCB: X,
    accumulatedZakat: Z,

    // EPF breakdown
    epfRelief,
    totalEPF: EK,

    // Relief breakdown
    reliefs: {
      individual: D,
      spouse: S,
      disabledIndividual: DU,
      disabledSpouse: SU,
      children: childRelief,
      other: ELP_LP1,
      total: totalDeductions
    },

    // Category
    taxCategory: isCategory2 ? 2 : 1
  };
};

/**
 * Simplified PCB calculation (backward compatible)
 * Uses the full LHDN formula but with simplified inputs
 */
const calculatePCB = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0,
  currentMonth = new Date().getMonth() + 1,
  ytdGross = 0,
  ytdEPF = 0,
  ytdPCB = 0,
  ytdZakat = 0
) => {
  const result = calculatePCBFull({
    normalRemuneration: grossSalary,
    additionalRemuneration: 0,
    currentMonth,
    accumulatedGross: ytdGross,
    accumulatedEPF: ytdEPF,
    accumulatedPCB: ytdPCB,
    accumulatedZakat: ytdZakat,
    maritalStatus,
    spouseWorking,
    childrenCount,
    epfRate: epfEmployee > 0 ? epfEmployee / grossSalary : 0.11
  });

  return result.pcb;
};

/**
 * PCB calculation with additional remuneration (bonus, commission)
 */
const calculatePCBWithBonus = (
  normalSalary,
  bonusOrCommission,
  currentMonth = new Date().getMonth() + 1,
  ytdGross = 0,
  ytdEPF = 0,
  ytdPCB = 0,
  ytdZakat = 0,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0
) => {
  return calculatePCBFull({
    normalRemuneration: normalSalary,
    additionalRemuneration: bonusOrCommission,
    currentMonth,
    accumulatedGross: ytdGross,
    accumulatedEPF: ytdEPF,
    accumulatedPCB: ytdPCB,
    accumulatedZakat: ytdZakat,
    maritalStatus,
    spouseWorking,
    childrenCount
  });
};

/**
 * Simplified PCB for standalone calculation (assumes January, no YTD)
 */
const calculatePCBSimple = (
  grossSalary,
  epfEmployee,
  maritalStatus = 'single',
  spouseWorking = false,
  childrenCount = 0
) => {
  return calculatePCB(
    grossSalary,
    epfEmployee,
    maritalStatus,
    spouseWorking,
    childrenCount,
    1, // January
    0, // No YTD gross
    0, // No YTD EPF
    0, // No YTD PCB
    0  // No YTD Zakat
  );
};

// Calculate age from date of birth
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return 30; // Default age if not provided

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

// Get employee age - first try IC number, then date_of_birth
const getEmployeeAge = (employee) => {
  // Try to get age from Malaysian IC first
  if (employee.ic_number) {
    const ageFromIC = calculateAgeFromIC(employee.ic_number);
    if (ageFromIC !== null && ageFromIC >= 0 && ageFromIC <= 120) {
      return ageFromIC;
    }
  }

  // Fall back to date_of_birth
  if (employee.date_of_birth) {
    return calculateAge(employee.date_of_birth);
  }

  return 30; // Default age
};

/**
 * Calculate all statutory deductions using full LHDN formula
 *
 * IMPORTANT: EPF/SOCSO/EIS are calculated on statutoryBase (typically basic + commission)
 * PCB is calculated on full gross income (including allowances)
 *
 * @param {number} statutoryBase - Amount subject to EPF/SOCSO/EIS (basic + commission)
 * @param {Object} employee - Employee details
 * @param {number} month - Current month (1-12)
 * @param {Object} ytdData - Year-to-date data for accurate PCB
 * @param {Object} breakdown - Salary breakdown { basic, commission, bonus, allowance, ot, pcbGross }
 *                            - pcbGross: Full gross for PCB calculation (includes allowance)
 */
const calculateAllStatutory = (statutoryBase, employee = {}, month = null, ytdData = null, breakdown = null) => {
  // Determine employee type for EPF:
  // 1. Use explicit residency_status if set (malaysian/pr/foreign)
  // 2. Fall back to IC-based detection (malaysian if valid IC, foreign otherwise)
  let employeeType;
  if (employee.residency_status && ['malaysian', 'pr', 'foreign'].includes(employee.residency_status)) {
    employeeType = employee.residency_status;
  } else {
    employeeType = isMalaysianIC(employee.ic_number) ? 'malaysian' : 'foreign';
  }

  // Get age from IC or DOB
  const age = getEmployeeAge(employee);

  const maritalStatus = employee.marital_status || 'single';
  const spouseWorking = employee.spouse_working || false;
  const childrenCount = employee.children_count || 0;

  // Calculate statutory contributions on statutoryBase (not full gross)
  // EPF, SOCSO, EIS apply to statutoryBase (basic + commission, excludes allowance if configured)
  const epf = calculateEPF(statutoryBase, age, 'normal', employeeType);
  const socso = calculateSOCSO(statutoryBase, age);
  const eis = calculateEIS(statutoryBase, age);

  // Calculate PCB using full LHDN formula
  let pcb;
  let pcbBreakdown = null;

  // Determine normal vs additional remuneration for PCB
  // PCB Y1 should be FULL gross (including allowance), not just statutory base
  // But EPF (K1) is calculated on statutory base only
  let normalRemuneration = statutoryBase;
  let additionalRemuneration = 0;
  let actualEPFNormal = null;  // Actual EPF on normal salary
  let actualEPFAdditional = null;  // Actual EPF on additional salary

  // Derive actual EPF employee rate from the calculated EPF result
  // This avoids hardcoding 0.11 which is wrong for foreign workers (2%), age 60+ (0% or 5.5%), etc.
  const actualEPFRate = statutoryBase > 0 ? epf.employee / statutoryBase : 0;

  if (breakdown) {
    // pcbGross = full gross including allowance for PCB calculation
    // breakdown.basic = basic salary only (for EPF calculation base)
    const pcbGross = breakdown.pcbGross || breakdown.basic || statutoryBase;
    const basic = breakdown.basic || 0;
    const allowance = breakdown.allowance || 0;
    const commission = breakdown.commission || 0;
    const bonus = breakdown.bonus || 0;
    const ot = breakdown.ot || 0;

    // Per-allowance-type taxability: if breakdown provides taxableAllowance (from
    // allowance_types.is_taxable), use it directly for PCB. Otherwise fall back to
    // employee-level allowance_pcb setting for backward compatibility.
    const allowancePcb = employee.allowance_pcb || 'excluded';
    const taxableAllowance = breakdown.taxableAllowance !== undefined
      ? breakdown.taxableAllowance
      : (allowancePcb === 'excluded' ? 0 : allowance);

    // Taxable allowances are fixed monthly amounts → Y1 (normal remuneration)
    normalRemuneration = basic + taxableAllowance;
    additionalRemuneration = commission + bonus + ot;

    // LHDN assigns ALL monthly EPF to K1, Kt = 0
    actualEPFNormal = epf.employee;
    actualEPFAdditional = 0;
  }

  const currentMonth = month || (new Date().getMonth() + 1);

  // LHDN PCB uses ∑LP + LP1 for PERKESO deduction (accumulated + current month)
  // LP1 = current month SOCSO + EIS (NOT annualized, NOT capped)
  // ∑LP = accumulated SOCSO + EIS from prior months (from ytdData.otherDeductions)
  const currentLP1 = socso.employee + eis.employee;

  if (ytdData) {
    // Use full LHDN formula with YTD data
    // ∑LP comes from ytdData.otherDeductions (accumulated prior months)
    const pcbResult = calculatePCBFull({
      normalRemuneration,
      additionalRemuneration,
      currentMonth,
      accumulatedGross: ytdData.ytdGross || 0,
      accumulatedEPF: ytdData.ytdEPF || 0,
      accumulatedPCB: ytdData.ytdPCB || 0,
      accumulatedZakat: ytdData.ytdZakat || 0,
      currentMonthZakat: ytdData.currentMonthZakat || 0,
      maritalStatus,
      spouseWorking,
      childrenCount,
      isDisabled: employee.is_disabled || false,
      spouseDisabled: employee.spouse_disabled || false,
      otherDeductions: (ytdData.otherDeductions || 0) + currentLP1,
      epfRate: actualEPFRate || 0.11,
      actualEPFNormal,
      actualEPFAdditional
    });

    pcb = pcbResult.pcb;
    pcbBreakdown = pcbResult;
  } else {
    // Use simplified calculation (assumes January or standalone)
    if (additionalRemuneration > 0 || breakdown) {
      const pcbResult = calculatePCBFull({
        normalRemuneration,
        additionalRemuneration,
        currentMonth,
        maritalStatus,
        spouseWorking,
        childrenCount,
        otherDeductions: currentLP1,
        epfRate: actualEPFRate || 0.11,
        actualEPFNormal,
        actualEPFAdditional
      });
      pcb = pcbResult.pcb;
      pcbBreakdown = pcbResult;
    } else {
      pcb = calculatePCBSimple(statutoryBase, epf.employee, maritalStatus, spouseWorking, childrenCount);
    }
  }

  const totalEmployeeDeductions = epf.employee + socso.employee + eis.employee + pcb;
  const totalEmployerContributions = epf.employer + socso.employer + eis.employer;
  const netSalary = statutoryBase - totalEmployeeDeductions;

  return {
    epf,
    socso,
    eis,
    pcb,
    pcbBreakdown, // Detailed PCB breakdown (if using full formula)
    totalEmployeeDeductions,
    totalEmployerContributions,
    grossSalary: statutoryBase,  // For backward compatibility
    netSalary
  };
};

// =====================================================
// OT CALCULATION
// =====================================================
// OT Rate: 1.0x (flat rate per hour)
// Public Holiday: Extra 1.0x daily rate (on top of normal pay)
// OT on Public Holiday: Still 1.0x (no extra multiplier for OT itself)

// Selangor Public Holidays 2024/2025
const SELANGOR_PUBLIC_HOLIDAYS = {
  2024: [
    '2024-01-01', // New Year
    '2024-01-25', // Thaipusam
    '2024-02-01', // Federal Territory Day
    '2024-02-10', // Chinese New Year
    '2024-02-11', // Chinese New Year (2nd day)
    '2024-03-28', // Nuzul Al-Quran
    '2024-04-10', // Hari Raya Aidilfitri
    '2024-04-11', // Hari Raya Aidilfitri (2nd day)
    '2024-05-01', // Labour Day
    '2024-05-22', // Wesak Day
    '2024-06-03', // Agong's Birthday
    '2024-06-17', // Hari Raya Aidiladha
    '2024-07-07', // Awal Muharram
    '2024-08-31', // Merdeka Day
    '2024-09-16', // Malaysia Day
    '2024-09-17', // Prophet Muhammad's Birthday (replacement)
    '2024-10-31', // Deepavali
    '2024-12-11', // Sultan of Selangor's Birthday
    '2024-12-25', // Christmas
  ],
  2025: [
    '2025-01-01', // New Year
    '2025-01-14', // Thaipusam (estimated)
    '2025-01-29', // Chinese New Year
    '2025-01-30', // Chinese New Year (2nd day)
    '2025-02-01', // Federal Territory Day
    '2025-03-17', // Nuzul Al-Quran (estimated)
    '2025-03-31', // Hari Raya Aidilfitri (estimated)
    '2025-04-01', // Hari Raya Aidilfitri (2nd day)
    '2025-05-01', // Labour Day
    '2025-05-12', // Wesak Day (estimated)
    '2025-06-02', // Agong's Birthday
    '2025-06-07', // Hari Raya Aidiladha (estimated)
    '2025-06-27', // Awal Muharram (estimated)
    '2025-08-31', // Merdeka Day
    '2025-09-05', // Prophet Muhammad's Birthday (estimated)
    '2025-09-16', // Malaysia Day
    '2025-10-20', // Deepavali (estimated)
    '2025-12-11', // Sultan of Selangor's Birthday
    '2025-12-25', // Christmas
  ],
  2026: [
    '2026-01-01', // New Year's Day
    '2026-02-17', // Chinese New Year
    '2026-03-21', // Hari Raya Aidilfitri
    '2026-03-22', // Hari Raya Aidilfitri (2nd day)
    '2026-05-01', // Labour Day
    '2026-05-27', // Hari Raya Haji (Aidiladha)
    '2026-06-01', // Agong's Birthday
    '2026-08-31', // National Day (Hari Merdeka)
    '2026-09-16', // Malaysia Day
    '2026-11-08', // Deepavali
    '2026-12-11', // Sultan of Selangor's Birthday
    '2026-12-25', // Christmas Day
  ]
};

// Kuala Lumpur Public Holidays (for KL outlets: 275, 291, 296, 307, 665)
const KL_PUBLIC_HOLIDAYS = {
  2025: [
    '2025-01-01', // New Year's Day
    '2025-01-14', // Thaipusam
    '2025-01-29', // Chinese New Year
    '2025-01-30', // Chinese New Year (2nd day)
    '2025-02-01', // Federal Territory Day
    '2025-03-17', // Nuzul Al-Quran
    '2025-03-31', // Hari Raya Aidilfitri
    '2025-04-01', // Hari Raya Aidilfitri (2nd day)
    '2025-05-01', // Labour Day
    '2025-06-02', // Agong's Birthday
    '2025-06-07', // Hari Raya Haji
    '2025-08-31', // Merdeka Day
    '2025-09-16', // Malaysia Day
    '2025-12-25', // Christmas
  ],
  2026: [
    '2026-01-01', // New Year's Day
    '2026-02-01', // Federal Territory Day
    '2026-02-17', // Chinese New Year
    '2026-03-21', // Hari Raya Aidilfitri
    '2026-03-22', // Hari Raya Aidilfitri (2nd day)
    '2026-05-01', // Labour Day
    '2026-05-27', // Hari Raya Haji (Aidiladha)
    '2026-06-01', // Agong's Birthday
    '2026-08-31', // National Day (Hari Merdeka)
    '2026-09-16', // Malaysia Day
    '2026-11-08', // Deepavali
    '2026-12-25', // Christmas Day
  ]
};

// Get holiday list by state (defaults to selangor for backward compatibility)
const getHolidayList = (year, state = 'selangor') => {
  if (state === 'kl') {
    return KL_PUBLIC_HOLIDAYS[year] || [];
  }
  return SELANGOR_PUBLIC_HOLIDAYS[year] || [];
};

// Check if a date is a public holiday
const isPublicHoliday = (dateStr, year = null, state = 'selangor') => {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  const y = year || date.getFullYear();
  const dateFormatted = date.toISOString().split('T')[0];

  const holidays = getHolidayList(y, state);
  return holidays.includes(dateFormatted);
};

// Count public holidays in a given month
const countPublicHolidaysInMonth = (year, month, state = 'selangor') => {
  const holidays = getHolidayList(year, state);
  return holidays.filter(h => {
    const d = new Date(h);
    return d.getMonth() + 1 === month;
  }).length;
};

// Get list of public holidays in a month
const getPublicHolidaysInMonth = (year, month, state = 'selangor') => {
  const holidays = getHolidayList(year, state);
  return holidays.filter(h => {
    const d = new Date(h);
    return d.getMonth() + 1 === month;
  });
};

// Calculate OT amount
// OT Rate: 1.0x per hour (flat rate)
// basicSalary is used to calculate the hourly rate
const calculateOT = (basicSalary, otHours, workingDaysInMonth = 22) => {
  if (!otHours || otHours <= 0) return 0;

  // OT rate is 1.0x
  const OT_RATE = 1.0;

  // Calculate hourly rate: basic salary / working days / 8 hours
  const dailyRate = basicSalary / workingDaysInMonth;
  const hourlyRate = dailyRate / 8;

  // OT amount = hourly rate × OT hours × OT rate multiplier
  const otAmount = hourlyRate * otHours * OT_RATE;

  return Math.round(otAmount * 100) / 100;
};

// Calculate public holiday extra pay
// If employee works on public holiday, they get extra 1.0x daily rate
const calculatePublicHolidayPay = (basicSalary, publicHolidayDaysWorked, workingDaysInMonth = 22) => {
  if (!publicHolidayDaysWorked || publicHolidayDaysWorked <= 0) return 0;

  // Extra rate is 1.0x daily rate
  const PH_EXTRA_RATE = 1.0;

  const dailyRate = basicSalary / workingDaysInMonth;
  const phPay = dailyRate * publicHolidayDaysWorked * PH_EXTRA_RATE;

  return Math.round(phPay * 100) / 100;
};

// =====================================================
// IC NUMBER FORMATTING & DETECTION
// =====================================================

// Valid Malaysian state codes (7th-8th digit of IC)
const VALID_STATE_CODES = [
  '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16', // Malaysian states
  '21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59', // Foreign countries
  '82' // Unknown state
];

/**
 * Format IC number with dashes: yymmddxxxxxx -> yymmdd-xx-xxxx
 * @param {string} ic - IC number (with or without dashes)
 * @returns {string} - Formatted IC with dashes, or original if not 12 digits
 */
const formatIC = (ic) => {
  if (!ic) return '';
  const clean = ic.replace(/[-\s]/g, '');
  if (clean.length !== 12) return ic; // Return as-is if not 12 digits
  return `${clean.slice(0,6)}-${clean.slice(6,8)}-${clean.slice(8)}`;
};

/**
 * Detect if ID is Malaysian IC or Passport
 * IC criteria: 12 digits + valid date (YYMMDD) + valid state code (7th-8th digit)
 * @param {string} idNumber - ID number to check
 * @returns {string} - 'ic' or 'passport'
 */
const detectIDType = (idNumber) => {
  if (!idNumber) return 'passport';
  const clean = idNumber.replace(/[-\s]/g, '');

  // Must be exactly 12 digits
  if (!/^\d{12}$/.test(clean)) return 'passport';

  // Validate date portion (YYMMDD)
  const month = parseInt(clean.substring(2, 4));
  const day = parseInt(clean.substring(4, 6));
  if (month < 1 || month > 12) return 'passport';
  if (day < 1 || day > 31) return 'passport';

  // Validate state code (7th-8th digit)
  const stateCode = clean.substring(6, 8);
  if (!VALID_STATE_CODES.includes(stateCode)) return 'passport';

  return 'ic';
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculatePCBFull,        // Full LHDN formula with detailed breakdown
  calculatePCBWithBonus,   // For salary + bonus/commission
  calculatePCBSimple,
  calculateAnnualTax,
  getTaxBracket,
  calculateAge,
  calculateAgeFromIC,
  getEmployeeAge,
  isMalaysianIC,
  calculateAllStatutory,
  TAX_BRACKETS,
  TAX_BRACKETS_LHDN,
  // OT and Public Holiday functions
  calculateOT,
  calculatePublicHolidayPay,
  isPublicHoliday,
  countPublicHolidaysInMonth,
  getPublicHolidaysInMonth,
  SELANGOR_PUBLIC_HOLIDAYS,
  KL_PUBLIC_HOLIDAYS,
  getHolidayList,
  // IC formatting and detection
  formatIC,
  detectIDType,
  VALID_STATE_CODES
};

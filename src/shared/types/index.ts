export type UserRole = 'user' | 'vet' | 'store' | 'admin';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: UserRole;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ServiceResponse<T> {
  data: T;
  message: string;
  pagination?: PaginationMeta;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  profilePhoto: string | null;
  city: string;
  area: string;
  fcmToken: string | null;
  language: string;
  pets: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedAddress {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  street: string;
  area: string;
  city: string;
  isDefault: boolean;
}

export interface ReminderResponse {
  petId: string;
  petName: string;
  vaccineName: string;
  daysUntilDue: number;
  suggestedClinic: string | null;
}

export interface VaccinationResponse {
  id: string;
  name: string;
  date: string;
  nextDue: string;
  vetId: string | null;
  vetName: string;
  verified: boolean;
  notes: string | null;
  certificatePhoto: string | null;
}

export interface WorkingDayResponse {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface WorkingHoursResponse {
  mon: WorkingDayResponse;
  tue: WorkingDayResponse;
  wed: WorkingDayResponse;
  thu: WorkingDayResponse;
  fri: WorkingDayResponse;
  sat: WorkingDayResponse;
  sun: WorkingDayResponse;
}

export interface VetResponse {
  id: string;
  name: string;
  clinicName: string;
  photo: string | null;
  email: string;
  phone: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
    distanceKm?: number;
  };
  address: string;
  city: string;
  area: string;
  fee: { min: number; max: number };
  specialty: string | null;
  about: string | null;
  yearsExperience: number | null;
  specializations: string[];
  languages: string[];
  workingHours: WorkingHoursResponse;
  is24Hours: boolean;
  isEmergency: boolean;
  radiusKm: number | null;
  rating: number;
  reviewCount: number;
  verified: boolean;
  subscriptionStatus: string;
  featured: boolean;
  createdAt: Date;
}

export interface ReviewResponse {
  id: string;
  vet: string;
  user: string;
  pet: string;
  rating: number;
  comment: string | null;
  petType: string;
  createdAt: Date;
}

export interface SlotResponse {
  time: string;
  status: 'available' | 'booked';
}

export interface EmergencyNearest {
  id: string;
  name: string;
  address: string;
  distanceKm: number;
  driveMin: number;
  openCount: number;
  radiusKm: number | null;
  phone: string;
}

export interface EmergencyNearby {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  etaMin: number;
  phone: string;
}

export interface EmergencyResponse {
  nearest: EmergencyNearest | null;
  nearby: EmergencyNearby[];
}

export interface AppointmentResponse {
  id: string;
  pet: string;
  vet: string;
  owner: string;
  date: string;
  timeSlot: string;
  status: string;
  fee: number;
  platformCommission: number;
  vetPayout: number;
  paymentMethod: string;
  paymentStatus: string;
  paymentReference: string | null;
  notes: string | null;
  reviewId: string | null;
  vetDetails: { name: string; clinicName: string; address: string; phone: string };
  petDetails: { name: string; species: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemResponse {
  product: string;
  name: string;
  photo: string;
  qty: number;
  price: number;
}

export interface ProductVariantResponse {
  id: string;
  label: string;
  price: number;
  originalPrice: number | null;
  inStock: boolean;
}

export interface ProductResponse {
  id: string;
  store: string;
  storeName: string;
  name: string;
  photo: string | null;
  description: string | null;
  category: string;
  petTypes: string[];
  brand: string | null;
  weight: string | null;
  price: number;
  originalPrice: number | null;
  inStock: boolean;
  variants: ProductVariantResponse[];
  isVetRecommended: boolean;
  recommendedBy: string | null;
  createdAt: Date;
}

export interface OrderResponse {
  id: string;
  orderId: string;
  user: string;
  store: string;
  storeName: string;
  items: OrderItemResponse[];
  totalAmount: number;
  platformCommission: number;
  storePayout: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  deliveryAddress: { street: string; area?: string; city: string; label: string | null };
  isSubscription: boolean;
  nextOrderDate: string | null;
  estimatedDelivery: string | null;
  rider: { name: string; phone: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  read: boolean;
  targetId: string | null;
  createdAt: Date;
}

export interface ThreadResponse {
  id: string;
  type: 'ai' | 'vet' | 'store';
  name: string;
  preview: string | null;
  unread: number;
  verified: boolean;
  vetId: string | null;
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageResponse {
  id: string;
  thread: string;
  type: 'text' | 'product_recommendation';
  sender: 'user' | 'doctor' | 'ai';
  text: string | null;
  product: { id: string; name: string; pricePKR: number; storeId: string; storeName: string } | null;
  createdAt: Date;
}

export interface PostResponse {
  id: string;
  author: string;
  authorName: string;
  petName: string | null;
  text: string;
  imageUrl: string | null;
  topics: string[];
  location: string | null;
  feeling: string | null;
  likes: number;
  comments: number;
  isStory: boolean;
  createdAt: Date;
}

export interface CommentResponse {
  id: string;
  postId: string;
  author: string;
  authorName: string;
  isVet: boolean;
  text: string;
  likes: number;
  createdAt: Date;
}

export interface PetResponse {
  id: string;
  owner: string;
  name: string;
  species: string;
  breed: string;
  dateOfBirth: string;
  weight: number;
  gender: string;
  color: string | null;
  photo: string | null;
  vaccinations: VaccinationResponse[];
  medicalHistory: string[];
  allergies: string[];
  currentMedications: string[];
  vaccinationStatus: string | null;
  remindersEnabled: boolean;
  isActive: boolean;
  passportUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

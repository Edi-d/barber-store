export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "user" | "creator" | "admin" | "moderator";
export type ContentType = "video" | "image" | "text" | "live_placeholder";
export type ContentStatus = "draft" | "published" | "hidden";
export type LiveStatus = "starting" | "live" | "ended";
export type LessonType = "video" | "text";
export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";
export type ReportStatus = "open" | "reviewed" | "closed";
export type ReportTargetType = "content" | "comment" | "user" | "live";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: UserRole;
          created_at: string;
          verified: boolean;
          followers_count: number;
          following_count: number;
          onboarding_completed: boolean;
          onboarding_role: string | null;
          search_vector: string | null;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          created_at?: string;
          verified?: boolean;
          followers_count?: number;
          following_count?: number;
          onboarding_completed?: boolean;
          onboarding_role?: string | null;
          search_vector?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          created_at?: string;
          verified?: boolean;
          followers_count?: number;
          following_count?: number;
          onboarding_completed?: boolean;
          onboarding_role?: string | null;
          search_vector?: string | null;
        };
      };
      content: {
        Row: {
          id: string;
          author_id: string;
          type: ContentType;
          caption: string | null;
          media_url: string | null;
          thumb_url: string | null;
          status: ContentStatus;
          likes_count: number;
          comments_count: number;
          created_at: string;
          updated_at: string | null;
          search_vector: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          type?: ContentType;
          caption?: string | null;
          media_url?: string | null;
          thumb_url?: string | null;
          status?: ContentStatus;
          likes_count?: number;
          comments_count?: number;
          created_at?: string;
          updated_at?: string | null;
          search_vector?: string | null;
        };
        Update: {
          id?: string;
          author_id?: string;
          type?: ContentType;
          caption?: string | null;
          media_url?: string | null;
          thumb_url?: string | null;
          status?: ContentStatus;
          likes_count?: number;
          comments_count?: number;
          created_at?: string;
          updated_at?: string | null;
          search_vector?: string | null;
        };
      };
      likes: {
        Row: {
          user_id: string;
          content_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          content_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          content_id?: string;
          created_at?: string;
        };
      };
      comments: {
        Row: {
          id: string;
          content_id: string;
          user_id: string;
          text: string;
          parent_id: string | null;
          is_edited: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          content_id: string;
          user_id: string;
          text: string;
          parent_id?: string | null;
          is_edited?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          content_id?: string;
          user_id?: string;
          text?: string;
          parent_id?: string | null;
          is_edited?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      lives: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          cover_url: string | null;
          room_name: string;
          status: LiveStatus;
          playback_url: string | null;
          viewers_count: number;
          started_at: string | null;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          title: string;
          cover_url?: string | null;
          room_name: string;
          status?: LiveStatus;
          playback_url?: string | null;
          viewers_count?: number;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          title?: string;
          cover_url?: string | null;
          room_name?: string;
          status?: LiveStatus;
          playback_url?: string | null;
          viewers_count?: number;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
      };
      courses: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          cover_url: string | null;
          is_premium: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          cover_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          cover_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
        };
      };
      course_modules: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          title: string;
          order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          order?: number;
          created_at?: string;
        };
      };
      lessons: {
        Row: {
          id: string;
          module_id: string;
          title: string;
          type: LessonType;
          content_url: string | null;
          duration_sec: number | null;
          order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          module_id: string;
          title: string;
          type?: LessonType;
          content_url?: string | null;
          duration_sec?: number | null;
          order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          module_id?: string;
          title?: string;
          type?: LessonType;
          content_url?: string | null;
          duration_sec?: number | null;
          order?: number;
          created_at?: string;
        };
      };
      lesson_progress: {
        Row: {
          user_id: string;
          lesson_id: string;
          completed: boolean;
          last_position_sec: number | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          lesson_id: string;
          completed?: boolean;
          last_position_sec?: number | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          lesson_id?: string;
          completed?: boolean;
          last_position_sec?: number | null;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          price_cents: number;
          currency: string;
          image_url: string | null;
          stock: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          price_cents: number;
          currency?: string;
          image_url?: string | null;
          stock?: number | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          image_url?: string | null;
          stock?: number | null;
          active?: boolean;
          created_at?: string;
        };
      };
      carts: {
        Row: {
          user_id: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          updated_at?: string;
        };
      };
      cart_items: {
        Row: {
          user_id: string;
          product_id: string;
          qty: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          product_id: string;
          qty?: number;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          product_id?: string;
          qty?: number;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          status: OrderStatus;
          total_cents: number;
          currency: string;
          shipping_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: OrderStatus;
          total_cents: number;
          currency?: string;
          shipping_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: OrderStatus;
          total_cents?: number;
          currency?: string;
          shipping_address?: string | null;
          created_at?: string;
        };
      };
      order_items: {
        Row: {
          order_id: string;
          product_id: string;
          qty: number;
          price_cents: number;
        };
        Insert: {
          order_id: string;
          product_id: string;
          qty: number;
          price_cents: number;
        };
        Update: {
          order_id?: string;
          product_id?: string;
          qty?: number;
          price_cents?: number;
        };
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          status: ReportStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: string;
          status?: ReportStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          target_type?: ReportTargetType;
          target_id?: string;
          reason?: string;
          status?: ReportStatus;
          created_at?: string;
        };
      };
      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
          created_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: string;
          entity_type: string | null;
          entity_id: string | null;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          event_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          event_type?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
      };
    };
  };
}

// Convenience types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Content = Database["public"]["Tables"]["content"]["Row"];
export type Like = Database["public"]["Tables"]["likes"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type Live = Database["public"]["Tables"]["lives"]["Row"];
export type Course = Database["public"]["Tables"]["courses"]["Row"];
export type CourseModule = Database["public"]["Tables"]["course_modules"]["Row"];
export type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
export type LessonProgress = Database["public"]["Tables"]["lesson_progress"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Cart = Database["public"]["Tables"]["carts"]["Row"];
export type CartItem = Database["public"]["Tables"]["cart_items"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];

// Extended types with relations
export type ContentWithAuthor = Content & {
  author: Profile;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
};

export type CourseWithModules = Course & {
  modules: (CourseModule & {
    lessons: Lesson[];
  })[];
  lessons_count: number;
  completed_count?: number;
};

export type CartItemWithProduct = CartItem & {
  product: Product;
};

export type OrderWithItems = Order & {
  items: (OrderItem & {
    product: Product;
  })[];
};

// ── Salon & Appointments types ──

export type SalonType =
  | 'barbershop'
  | 'coafor'
  | 'manichiura'
  | 'masaj'
  | 'beauty'
  | 'epilare'
  | 'gene'
  | 'tatuaj'
  | 'altele';

export interface Salon {
  id: string;
  owner_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  // CSS-style object-position focal point for the cover image, e.g. "50% 30%".
  // Null = default center. Set by the salon owner in the business app.
  cover_position: string | null;
  bio: string | null;
  specialties: string[] | null;
  latitude: number | null;
  longitude: number | null;
  rating_avg: number | null;
  reviews_count: number | null;
  avg_price_cents: number | null;
  is_promoted: boolean;
  amenities: string[] | null;
  salon_type: SalonType; // legacy alias
  salon_types: SalonType[];
  active: boolean;
  created_at: string;
}

export interface BarberService {
  id: string;
  salon_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  price_cents: number;
  // Optional per-service price (in cents) that applies only while the salon is
  // in its extended-hours ("program prelungit") window. When set (> 0) for a
  // slot in that window it REPLACES the base price and the day-level surcharge
  // for that service. Null = no special extended price (falls back to price_cents).
  price_cents_extended: number | null;
  currency: string;
  category: string | null;
  active: boolean;
  created_at: string;
}

export interface Barber {
  id: string;
  profile_id: string | null;
  salon_id: string | null;
  role: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rating_avg: number | null;
  reviews_count: number | null;
  cover_url: string | null;
  phone: string | null;
  avg_price_cents: number | null;
  is_promoted: boolean;
  amenities: string[] | null;
  active: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  barber_id: string;
  service_id: string;
  scheduled_at: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string | null;
  total_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
  // Set when this appointment is one occurrence of a recurring package
  // ("pachet recurent", migration 158). Every occurrence of the same purchased
  // package shares this id; NULL for ordinary bookings.
  package_id?: string | null;
  // Set when this appointment was booked together with back-to-back guests
  // (migration 157). NULL for solo bookings.
  booking_group_id?: string | null;
}

export interface AppointmentService {
  id: string;
  appointment_id: string;
  service_id: string;
  duration_min: number;
  price_cents: number;
  sort_order: number;
  created_at: string;
}

export type AppointmentServiceWithDetails = AppointmentService & {
  service: BarberService;
};

export type AppointmentWithDetails = Appointment & {
  barber: Barber;
  service: BarberService;
  services?: AppointmentServiceWithDetails[];
  // Present only when the booking was made for a dependent (a child / other
  // person the account holder manages). managed_by_profile_id is set for those
  // rows; a normal self-booking's own CRM row is not readable here (RLS), so
  // this stays null/undefined and no "Pentru {name}" pill is shown.
  salon_client?: {
    first_name: string | null;
    last_name: string | null;
    managed_by_profile_id: string | null;
  } | null;
};

// A recurring-package definition a service offers ("pachet recurent",
// migration 158 / web 20260711). The owner configures it on the web; the mobile
// client reads the active catalogue (RLS: "public reads active recurring
// packages") to let the client pick one at booking. interval_unit/interval_count
// + occurrences are the authoritative engine params; duration_months/cadence are
// friendlier labels (nullable on legacy rows).
export interface ServiceRecurringPackage {
  id: string;
  salon_id: string;
  service_id: string;
  duration_months: number | null;
  cadence: "weekly" | "biweekly" | "monthly" | null;
  interval_unit: "week" | "month";
  interval_count: number;
  occurrences: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  price_cents: number;
  active: boolean;
  sort_order: number;
  created_at: string;
}

// One purchased recurring package = a bounded set of generated appointments
// (migration 158). Occurrences link back via appointments.package_id.
export interface AppointmentPackage {
  id: string;
  salon_id: string;
  barber_id: string | null;
  service_id: string | null;
  user_id: string | null;
  salon_client_id: string | null;
  anchor_start_at: string;
  interval_unit: "week" | "month";
  interval_count: number;
  occurrences: number;
  price_cents: number;
  payment_method: "cash" | "card";
  payment_status: "pending" | "paid";
  status: "active" | "cancelled";
  source_package_id: string | null;
  created_at: string;
}

// Row returned by the book_recurring_package RPC (migration 158).
export interface BookRecurringPackageResult {
  package_id: string;
  booking_id: string;
  occurrences: number;
  shifted_count: number;
  first_slot_iso: string;
}

export interface BarberAvailability {
  id: string;
  barber_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export type CommentWithAuthor = Comment & {
  author: Profile;
};

export type CommentWithReplies = CommentWithAuthor & {
  replies?: CommentWithAuthor[];
};

export type LiveWithHost = Live & {
  host: Profile;
};

export interface SalonReview {
  id: string;
  user_id: string;
  salon_id: string;
  barber_id: string | null;
  rating: number;
  comment: string | null;
  photo_urls: string[];
  owner_reply: string | null;
  owner_reply_at: string | null;
  created_at: string;
}

export interface SalonFavorite {
  user_id: string;
  salon_id: string;
  created_at: string;
}

export interface SalonHappyHour {
  id: string;
  salon_id: string;
  discount_percent: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
}

export interface SalonPhoto {
  id: string;
  salon_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export type SalonReviewWithAuthor = SalonReview & {
  profile: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
  barber?: Pick<Barber, 'name'> | null;
};

// ── Social / discovery types added by migrations 039-050 ──

export interface TrendingTopic {
  id: string;
  name: string;
  category: string | null;
  post_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentLike {
  user_id: string;
  comment_id: string;
  created_at: string;
}

export interface Hashtag {
  id: string;
  name: string;
  post_count: number;
  created_at: string;
}

export interface ContentHashtag {
  content_id: string;
  hashtag_id: string;
  created_at: string;
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
}

// ── Notifications ──

export interface Notification {
  id: string;
  user_id: string;
  type: string; // 'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'live'
  actor_id: string;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  read: boolean;
  created_at: string;
}

export type NotificationWithActor = Notification & {
  actor: Pick<Profile, 'display_name' | 'username' | 'avatar_url'>;
};

// ── Search ──

export type SearchResultType = 'salon' | 'person' | 'post';

// ── Platform XP (DIVE loyalty) ──────────────────────────

export interface PlatformXpTransaction {
  id: string;
  user_id: string;
  amount: number;            // positive = earn, negative = reverse/redeem
  balance_after: number;     // user's running balance after this row
  source_type: string;       // 'appointment' | 'order' | 'reverse' | 'voucher' | etc.
  source_id: string | null;  // appointment.id or order.id etc.
  salon_id: string | null;
  ron_amount_cents: number | null;
  description: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface XpLevelThreshold {
  level: number;             // 1..N, monotonic
  xp_required: number;       // minimum lifetime XP to reach this level
  title: string;             // 'Bronze' | 'Silver' | 'Gold' | ...
  perks: string[];           // JSONB array of perk strings
  created_at: string;
}

export interface XpVoucherTier {
  tier_points: number;       // points cost (1000 | 3000 | 6000 | 10000)
  voucher_value_cents: number;
  label_ro: string;
  bonus_pct: number;         // 0 | 17 | 33 | 50
  is_active: boolean;
  sort_order: number;
}

// ── RPC result types (migration 144) ──

/**
 * One busy range returned by get_barber_busy_intervals.
 * busy_start / busy_end are ISO-8601 timestamptz strings.
 * reason is null for appointment slots, or the break's reason_type
 * ('lunch' | 'vacation' | 'training' | 'personal' | 'other') for break occurrences.
 */
export interface BusyInterval {
  busy_start: string;
  busy_end: string;
  reason: string | null;
}

/**
 * The single row returned inside the data array by book_appointment RPC.
 * Price is server-computed; status is always 'pending'.
 */
export interface BookAppointmentResult {
  id: string;
  scheduled_at: string;
  duration_min: number;
  total_cents: number;
  currency: string;
  status: AppointmentStatus;
}

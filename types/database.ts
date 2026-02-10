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
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          type?: ContentType;
          caption?: string | null;
          media_url?: string | null;
          thumb_url?: string | null;
          status?: ContentStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          type?: ContentType;
          caption?: string | null;
          media_url?: string | null;
          thumb_url?: string | null;
          status?: ContentStatus;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          user_id: string;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          user_id?: string;
          text?: string;
          created_at?: string;
        };
      };
      lives: {
        Row: {
          id: string;
          host_id: string;
          title: string;
          cover_url: string | null;
          is_public: boolean;
          status: LiveStatus;
          provider: string | null;
          ingest_url: string | null;
          stream_key: string | null;
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
          is_public?: boolean;
          status?: LiveStatus;
          provider?: string | null;
          ingest_url?: string | null;
          stream_key?: string | null;
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
          is_public?: boolean;
          status?: LiveStatus;
          provider?: string | null;
          ingest_url?: string | null;
          stream_key?: string | null;
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

// Appointments types
export interface BarberService {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price_cents: number;
  currency: string;
  active: boolean;
  created_at: string;
}

export interface Barber {
  id: string;
  profile_id: string | null;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  address: string | null;
  city: string | null;
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
}

export type AppointmentWithDetails = Appointment & {
  barber: Barber;
  service: BarberService;
};

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

export type LiveWithHost = Live & {
  host: Profile;
};

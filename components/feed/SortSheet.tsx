import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand, Bubble, FontFamily, Colors } from '@/constants/theme';
import type { FeedSort } from '@/types/feed';

interface SortOption {
  sort: FeedSort;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const SORT_OPTIONS: SortOption[] = [
  {
    sort: 'trending',
    label: 'Trending',
    description: 'Postări populare în ultimele 24h',
    icon: 'flame-outline',
  },
  {
    sort: 'newest',
    label: 'Cele mai noi',
    description: 'Cele mai recente postări întâi',
    icon: 'time-outline',
  },
  {
    sort: 'most_liked',
    label: 'Cele mai apreciate',
    description: 'Sortate după numărul de like-uri',
    icon: 'heart-outline',
  },
];

interface SortSheetProps {
  visible: boolean;
  activeSort: FeedSort;
  onSortChange: (sort: FeedSort) => void;
  onClose: () => void;
}

export function SortSheet({ visible, activeSort, onSortChange, onClose }: SortSheetProps) {
  const handleSelect = (sort: FeedSort) => {
    onSortChange(sort);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      />

      {/* Sheet */}
      <View
        style={{
          backgroundColor: '#F0F4F8',
          borderTopLeftRadius: Bubble.sheetRadii.borderTopLeftRadius,
          borderTopRightRadius: Bubble.sheetRadii.borderTopRightRadius,
          paddingBottom: 36,
        }}
      >
        {/* Handle */}
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(0,0,0,0.15)',
            alignSelf: 'center',
            marginTop: 10,
            marginBottom: 4,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.bold,
              fontSize: 18,
              color: Colors.text,
            }}
          >
            Sortează feed-ul
          </Text>
          <Pressable
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.9)',
              borderBottomWidth: 1.5,
              borderBottomColor: 'rgba(10,102,194,0.18)',
              borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
              borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
              borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
              borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={18} color={Colors.text} />
          </Pressable>
        </View>

        {/* Divider */}
        <View
          style={{
            height: 1,
            backgroundColor: 'rgba(10,102,194,0.08)',
            marginHorizontal: 20,
            marginBottom: 8,
          }}
        />

        {/* Options */}
        {SORT_OPTIONS.map((option, index) => {
          const isActive = activeSort === option.sort;
          return (
            <Pressable
              key={option.sort}
              onPress={() => handleSelect(option.sort)}
              className="mx-4 my-1"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: isActive
                  ? 'rgba(10,102,194,0.07)'
                  : 'rgba(255,255,255,0.6)',
                borderWidth: 1,
                borderColor: isActive
                  ? 'rgba(10,102,194,0.2)'
                  : 'rgba(255,255,255,0.8)',
                borderBottomWidth: 1.5,
                borderBottomColor: isActive
                  ? 'rgba(10,102,194,0.25)'
                  : 'rgba(10,102,194,0.1)',
                borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
                borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
                borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
                borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
              }}
            >
              {/* Icon container */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: isActive
                    ? Brand.primary
                    : 'rgba(255,255,255,0.85)',
                  borderWidth: 1,
                  borderColor: isActive
                    ? Brand.primary
                    : 'rgba(10,102,194,0.12)',
                  borderBottomWidth: 1.5,
                  borderBottomColor: isActive
                    ? Brand.primary
                    : 'rgba(10,102,194,0.2)',
                  borderTopLeftRadius: Bubble.radiiSm.borderTopLeftRadius,
                  borderTopRightRadius: Bubble.radiiSm.borderTopRightRadius,
                  borderBottomRightRadius: Bubble.radiiSm.borderBottomRightRadius,
                  borderBottomLeftRadius: Bubble.radiiSm.borderBottomLeftRadius,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={isActive ? '#ffffff' : Brand.primary}
                />
              </View>

              {/* Labels */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: isActive ? FontFamily.semiBold : FontFamily.medium,
                    fontSize: 15,
                    color: isActive ? Brand.primary : Colors.text,
                  }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{
                    fontFamily: FontFamily.regular,
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginTop: 1,
                  }}
                >
                  {option.description}
                </Text>
              </View>

              {/* Checkmark */}
              {isActive && (
                <Ionicons name="checkmark-circle" size={20} color={Brand.primary} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

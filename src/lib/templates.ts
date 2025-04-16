export const EMAIL_TEMPLATES = {
  ORDER_CONFIRMATION: {
    name: 'order_confirmation',
    description: 'Sent when a new order is placed',
    variables: ['user_name', 'pickup_date', 'return_date', 'items'],
  },
  PICKUP_REMINDER: {
    name: 'pickup_reminder',
    description: 'Sent one day before scheduled pickup',
    variables: ['user_name', 'pickup_date', 'items'],
  },
  RETURN_REMINDER: {
    name: 'return_reminder',
    description: 'Sent one day before return date',
    variables: ['user_name', 'return_date', 'items'],
  },
  RETURN_CONFIRMATION: {
    name: 'return_confirmation',
    description: 'Sent when items are returned',
    variables: ['user_name', 'items'],
  },
  NEW_ORDER_NOTIFICATION: {
    name: 'new_order_notification',
    description: 'Sent to admins when a new order is placed',
    variables: ['user_name', 'user_email', 'pickup_date', 'return_date', 'items'],
  },
};